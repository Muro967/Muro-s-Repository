import "server-only";
import type { AuthRepository } from "@/features/auth/auth-repository";
import { readSession } from "@/features/auth/auth-service";
import { requestSessionToken } from "@/features/auth/session-cookie";
import { apiError, jsonResponse, readJsonBody } from "@/server/http/json";
import { assertSameOrigin } from "@/server/http/origin";
import { WardrobeError, type WardrobeRepository } from "./wardrobe-repository";
import { createWardrobeService, reorderLocationsSchema } from "./wardrobe-service";

export type WardrobeRouteDependencies = { appUrl: string; authRepository: AuthRepository; repository: WardrobeRepository; now: () => Date };
export function createWardrobeHandlers(deps: WardrobeRouteDependencies) {
  const service = createWardrobeService(deps.repository);
  const authenticated = (write: boolean, action: (userId: string, body: unknown, id: string) => Promise<Response>) =>
    async (request: Request, id = ""): Promise<Response> => {
      if (write) {
        try { assertSameOrigin(request, deps.appUrl); }
        catch { return apiError("ORIGIN_MISMATCH", 403, "Request origin is not allowed."); }
      }
      try {
        const token = requestSessionToken(request);
        const user = token ? await readSession(token, deps.authRepository, deps.now()) : null;
        if (!user) return apiError("UNAUTHORIZED", 401, "Sign in to continue.");
        let body: unknown;
        if (write) {
          const parsed = await readJsonBody(request);
          if (!parsed.ok) return apiError("INVALID_INPUT", 400, "A valid JSON request body is required.");
          body = parsed.value;
        }
        return await action(user.id, body, id);
      } catch (error) {
        if (error instanceof WardrobeError) {
          if (error.code === "NOT_FOUND") return apiError(error.code, 404, "The location was not found.");
          if (error.code === "INVALID_INPUT") return apiError(error.code, 400, "The request contains invalid fields.");
          if (error.code === "LAST_WARDROBE") return apiError(error.code, 409, "The final wardrobe cannot be deleted.");
          return apiError(error.code, 409, "The location cannot be deleted without an available destination.");
        }
        return apiError("INTERNAL_ERROR", 500, "The request could not be completed.");
      }
    };
  const reorderedIds = (body: unknown) => {
    const parsed = reorderLocationsSchema.safeParse(body);
    if (!parsed.success) throw new WardrobeError("INVALID_INPUT");
    return parsed.data.orderedIds;
  };
  return {
    list: authenticated(false, async (userId) => jsonResponse({ wardrobes: await service.list(userId) })),
    createWardrobe: authenticated(true, async (userId, body) => jsonResponse({ wardrobe: await service.createWardrobe(userId, body) }, 201)),
    renameWardrobe: authenticated(true, async (userId, body, id) => { await service.renameWardrobe(userId, id, body); return jsonResponse({ ok: true }); }),
    reorderWardrobes: authenticated(true, async (userId, body) => { await service.reorderWardrobes(userId, reorderedIds(body)); return jsonResponse({ ok: true }); }),
    deleteWardrobe: authenticated(true, async (userId, body, id) => { await service.deleteWardrobe(userId, id, body); return jsonResponse({ ok: true }); }),
    createZone: authenticated(true, async (userId, body, id) => jsonResponse({ zone: await service.createZone(userId, id, body) }, 201)),
    renameZone: authenticated(true, async (userId, body, id) => { await service.renameZone(userId, id, body); return jsonResponse({ ok: true }); }),
    reorderZones: authenticated(true, async (userId, body, id) => { await service.reorderZones(userId, id, reorderedIds(body)); return jsonResponse({ ok: true }); }),
    deleteZone: authenticated(true, async (userId, body, id) => { await service.deleteZone(userId, id, body); return jsonResponse({ ok: true }); }),
  };
}
