import "server-only";
import { randomUUID } from "node:crypto";
import type { StorageRepository } from "./storage-repository";
import { extensions, StorageError, uploadIdSchema, uploadSchema, validateObjectMetadata, type StorageProvider } from "./storage-provider";

export type StorageDependencies = { userId: string; provider: StorageProvider; repository: StorageRepository; now?: () => Date };

export async function createUpload(input: unknown, deps: StorageDependencies) {
  const parsed = uploadSchema.safeParse(input);
  if (!parsed.success || !/^[a-zA-Z0-9_-]{1,128}$/.test(deps.userId)) throw new StorageError("UNSUPPORTED_UPLOAD");
  const now = deps.now?.() ?? new Date();
  const uploadId = randomUUID();
  const data = parsed.data;
  const objectKey = `users/${deps.userId}/${data.kind}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.${extensions[data.contentType]}`;
  const target = await deps.provider.createUploadTarget({ uploadId, objectKey, contentType: data.contentType, sizeBytes: data.sizeBytes });
  await deps.repository.create({ id: uploadId, userId: deps.userId, objectKey, contentType: data.contentType, sizeBytes: data.sizeBytes, status: "pending", createdAt: now, completedAt: null });
  return { uploadId, ...target, objectKey };
}

export async function ownedUpload(uploadId: string, deps: Pick<StorageDependencies, "repository" | "userId">) {
  if (!uploadIdSchema.safeParse(uploadId).success) throw new StorageError("UPLOAD_NOT_FOUND");
  const upload = await deps.repository.findOwned(uploadId, deps.userId);
  if (!upload) throw new StorageError("UPLOAD_NOT_FOUND");
  validateObjectMetadata(upload.objectKey, upload.sizeBytes, upload.contentType);
  if (!upload.objectKey.startsWith(`users/${deps.userId}/`)) throw new StorageError("UPLOAD_NOT_FOUND");
  return upload;
}

export async function completeUpload(uploadId: string, deps: StorageDependencies): Promise<{ uploadId: string; status: "completed" }> {
  const upload = await ownedUpload(uploadId, deps);
  if (upload.status !== "completed") {
    if (!await deps.provider.verifyObject(upload.objectKey, upload.sizeBytes, upload.contentType)) throw new StorageError("UPLOAD_INCOMPLETE");
    if (!await deps.repository.completePending(uploadId, deps.userId, deps.now?.() ?? new Date())) {
      const current = await ownedUpload(uploadId, deps);
      if (current.status !== "completed") throw new StorageError("UPLOAD_CONFLICT");
    }
  }
  return { uploadId, status: "completed" };
}
