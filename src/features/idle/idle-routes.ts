import "server-only";
import type { AuthRepository } from "../auth/auth-repository";
import { readSession } from "../auth/auth-service";
import { requestSessionToken } from "../auth/session-cookie";
import { apiError, jsonResponse, readJsonBody } from "@/server/http/json";
import { assertSameOrigin } from "@/server/http/origin";
import { IdleError, type IdleRepository } from "./idle-repository";
import { createIdleService } from "./idle-service";
import { createIdleSettingsService } from "./idle-settings-service";

export type IdleRouteDependencies = { appUrl: string; authRepository: AuthRepository; repository: IdleRepository; now: () => Date };
export function createIdleHandlers(deps: IdleRouteDependencies) {
  const service = createIdleService(deps.repository, deps.now);
  const settings = createIdleSettingsService(deps.repository);
  function authenticated(write: boolean, action: (userId: string, input: unknown, id: string) => Promise<Response>, allowEmptyBody = false) {
    return async (request: Request, id = "") => {
      if (write) {
        try { assertSameOrigin(request, deps.appUrl); }
        catch { return apiError("ORIGIN_MISMATCH", 403, "Request origin is not allowed."); }
      }
      try {
        const token = requestSessionToken(request);
        const user = token ? await readSession(token, deps.authRepository, deps.now()) : null;
        if (!user) return apiError("UNAUTHORIZED", 401, "Sign in to continue.");
        let input: unknown;
        if (write && allowEmptyBody && request.body === null) input = {};
        else if (write) {
          const parsed = await readJsonBody(request);
          if (!parsed.ok) return apiError("INVALID_INPUT", 400, "A valid JSON request body is required.");
          input = parsed.value;
        }
        return await action(user.id, input, id);
      } catch (error) {
        if (error instanceof IdleError) {
          if (error.code === "NOT_FOUND") return apiError(error.code, 404, "The resource was not found.");
          if (error.code === "INVALID_INPUT") return apiError(error.code, 400, "The request contains invalid fields.");
          return apiError(error.code, 409, "The item cannot perform this action in its current state.");
        }
        return apiError("INTERNAL_ERROR", 500, "The request could not be completed.");
      }
    };
  }
  return {
    readIdleDashboard: authenticated(false, async (userId) => jsonResponse(await service.readIdleDashboard(userId))),
    readIdleSettings: authenticated(false, async (userId) => jsonResponse({ settings: await settings.readIdleSettings(userId) })),
    updateIdleSettings: authenticated(true, async (userId, body) => jsonResponse({ settings: await settings.updateIdleSettings(userId, body) })),
    startWatching: authenticated(true, async (userId, body, id) => jsonResponse({ item: await service.startWatching(userId, id, body) }), true),
    cancelWatching: authenticated(true, async (userId, body, id) => jsonResponse({ item: await service.cancelWatching(userId, id, body) }), true),
    disposeItem: authenticated(true, async (userId, body, id) => jsonResponse({ disposal: await service.disposeItem(userId, id, body) })),
  };
}
