import "server-only";
import type { AuthRepository } from "@/features/auth/auth-repository";
import { readSession } from "@/features/auth/auth-service";
import { requestSessionToken } from "@/features/auth/session-cookie";
import { apiError, jsonResponse, readJsonBody } from "@/server/http/json";
import { assertSameOrigin } from "@/server/http/origin";
import { completeUpload, createUpload, ownedUpload, type StorageDependencies } from "./storage-service";
import { LocalStorageProvider } from "./local-storage-provider";
import { StorageError } from "./storage-provider";

export type UploadRouteDependencies = Omit<StorageDependencies, "userId"> & {
  appUrl: string; authRepository: AuthRepository; now: () => Date;
};
function storageFailure(error: unknown): Response {
  if (error instanceof StorageError) {
    if (error.code === "UPLOAD_NOT_FOUND") return apiError(error.code, 404, "The upload was not found.");
    if (error.code === "UPLOAD_INCOMPLETE" || error.code === "UPLOAD_CONFLICT") return apiError(error.code, 409, "The upload is not ready or cannot be changed.");
    if (error.code === "UNSUPPORTED_UPLOAD" || error.code === "UPLOAD_SIZE_MISMATCH") return apiError(error.code, 400, "The upload does not meet the requirements.");
  }
  return apiError("INTERNAL_ERROR", 500, "The request could not be completed.");
}
export function createUploadHandlers(deps: UploadRouteDependencies) {
  const authenticated = (action: (request: Request, deps: StorageDependencies, uploadId: string) => Promise<Response>) =>
    async (request: Request, uploadId = ""): Promise<Response> => {
      try { assertSameOrigin(request, deps.appUrl); }
      catch { return apiError("ORIGIN_MISMATCH", 403, "Request origin is not allowed."); }
      try {
        const token = requestSessionToken(request);
        const user = token ? await readSession(token, deps.authRepository, deps.now()) : null;
        if (!user) return apiError("UNAUTHORIZED", 401, "Sign in to continue.");
        return await action(request, { ...deps, userId: user.id }, uploadId);
      } catch (error) { return storageFailure(error); }
    };
  return {
    create: authenticated(async (request, dependencies) => {
      const body = await readJsonBody(request);
      if (!body.ok) return apiError("INVALID_INPUT", 400, "A valid JSON request body is required.");
      const { uploadId, method, url, headers } = await createUpload(body.value, dependencies);
      return jsonResponse({ uploadId, method, url, headers }, 201);
    }),
    complete: authenticated(async (_request, dependencies, uploadId) => jsonResponse(await completeUpload(uploadId, dependencies))),
    put: authenticated(async (request, dependencies, uploadId) => {
      const upload = await ownedUpload(uploadId, dependencies);
      if (!(deps.provider instanceof LocalStorageProvider)) throw new StorageError("UPLOAD_NOT_FOUND");
      if (upload.status !== "pending") throw new StorageError("UPLOAD_CONFLICT");
      const length = request.headers.get("content-length");
      if (request.headers.get("content-type") !== upload.contentType ||
        (length !== null && (!/^\d+$/.test(length) || Number(length) !== upload.sizeBytes)) ||
        !request.body || request.bodyUsed || request.body.locked) throw new StorageError("UNSUPPORTED_UPLOAD");
      await deps.provider.writeObject(upload.objectKey, request.body, upload.sizeBytes, upload.contentType);
      return jsonResponse({ uploadId, status: "pending" });
    }),
  };
}
