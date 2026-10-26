import "server-only";

import type { AuthRepository } from "../auth/auth-repository";
import { readSession } from "../auth/auth-service";
import { requestSessionToken } from "../auth/session-cookie";
import { apiError, jsonResponse, readJsonBody } from "@/server/http/json";
import { assertSameOrigin } from "@/server/http/origin";
import { RecreationError, type RecreationRepository } from "./recreation-repository";
import { createRecreationService } from "./recreation-service";

export type RecreationRouteDependencies = {
  appUrl: string;
  authRepository: AuthRepository;
  now: () => Date;
  repository: RecreationRepository;
};

export function createRecreationHandlers(dependencies: RecreationRouteDependencies) {
  const service = createRecreationService(dependencies);
  const user = async (request: Request) => {
    const token = requestSessionToken(request);
    return token ? readSession(token, dependencies.authRepository, dependencies.now()) : null;
  };
  const failed = (error: unknown) => {
    if (error instanceof RecreationError) {
      if (error.code === "NOT_FOUND") return apiError("NOT_FOUND", 404, "The recreation was not found.");
      if (error.code === "CANDIDATES_CHANGED") return apiError("CANDIDATES_CHANGED", 409, "The wardrobe changed while building this look.");
      return apiError("INVALID_INPUT", 400, "The request does not meet the requirements.");
    }
    return apiError("INTERNAL_ERROR", 500, "The request could not be completed.");
  };
  return {
    create: async (request: Request, inspirationId: string) => {
      try {
        assertSameOrigin(request, dependencies.appUrl);
      } catch {
        return apiError("ORIGIN_MISMATCH", 403, "Request origin is not allowed.");
      }
      try {
        const current = await user(request);
        if (!current) return apiError("UNAUTHORIZED", 401, "Sign in to continue.");
        const parsed = await readJsonBody(request);
        if (!parsed.ok || !parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value) || Object.keys(parsed.value).length > 0) {
          return apiError("INVALID_INPUT", 400, "An empty JSON object is required.");
        }
        return jsonResponse({ recreation: await service.create(current.id, inspirationId) }, 201);
      } catch (error) { return failed(error); }
    },
    read: async (request: Request, recreationId: string) => {
      try {
        const current = await user(request);
        if (!current) return apiError("UNAUTHORIZED", 401, "Sign in to continue.");
        return jsonResponse({ recreation: await service.read(current.id, recreationId) });
      } catch (error) { return failed(error); }
    },
  };
}
