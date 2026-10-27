import "server-only";

import type { AuthRepository } from "@/features/auth/auth-repository";
import { readSession } from "@/features/auth/auth-service";
import { requestSessionToken } from "@/features/auth/session-cookie";
import { apiError, jsonResponse, readJsonBody } from "@/server/http/json";
import { assertSameOrigin } from "@/server/http/origin";

import { InspirationError } from "./inspiration-repository";
import {
  createInspirationService,
  type InspirationServiceDependencies,
} from "./inspiration-service";

export type InspirationRouteDependencies = InspirationServiceDependencies & {
  appUrl: string;
  authRepository: AuthRepository;
};

export function createInspirationHandlers(dependencies: InspirationRouteDependencies) {
  const service = createInspirationService(dependencies);
  const authenticated = (
    write: boolean,
    action: (userId: string, body: unknown, id: string) => Promise<Response>,
  ) => async (request: Request, id = ""): Promise<Response> => {
    if (write) {
      try {
        assertSameOrigin(request, dependencies.appUrl);
      } catch {
        return apiError("ORIGIN_MISMATCH", 403, "Request origin is not allowed.");
      }
    }
    try {
      const token = requestSessionToken(request);
      const user = token
        ? await readSession(token, dependencies.authRepository, dependencies.now())
        : null;
      if (!user) return apiError("UNAUTHORIZED", 401, "Sign in to continue.");
      let body: unknown;
      if (write) {
        const parsed = await readJsonBody(request);
        if (!parsed.ok) {
          return apiError("INVALID_INPUT", 400, "A valid JSON request body is required.");
        }
        body = parsed.value;
      }
      return await action(user.id, body, id);
    } catch (error) {
      if (error instanceof InspirationError) {
        if (error.code === "NOT_FOUND") {
          return apiError("NOT_FOUND", 404, "The inspiration was not found.");
        }
        if (error.code === "INVALID_INPUT" || error.code === "INVALID_IMAGE") {
          return apiError(error.code, 400, "The request does not meet the requirements.");
        }
        return apiError(error.code, 409, "The inspiration has changed or the image is already used.");
      }
      return apiError("INTERNAL_ERROR", 500, "The request could not be completed.");
    }
  };

  return {
    list: authenticated(false, async (userId) => jsonResponse({
      inspirations: await service.list(userId),
    })),
    create: authenticated(true, async (userId, body) => jsonResponse({
      inspiration: await service.create(userId, body),
    }, 201)),
    read: authenticated(false, async (userId, _body, id) => jsonResponse({
      inspiration: await service.read(userId, id),
    })),
    update: authenticated(true, async (userId, body, id) => jsonResponse({
      inspiration: await service.update(userId, id, body),
    })),
    remove: authenticated(true, async (userId, body, id) => {
      await service.remove(userId, id, body);
      return jsonResponse({ ok: true });
    }),
  };
}
