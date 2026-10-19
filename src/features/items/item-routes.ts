import "server-only";
import { z } from "zod";
import type { AuthRepository } from "@/features/auth/auth-repository";
import { readSession } from "@/features/auth/auth-service";
import { requestSessionToken } from "@/features/auth/session-cookie";
import { apiError, jsonResponse, readJsonBody } from "@/server/http/json";
import { assertSameOrigin } from "@/server/http/origin";
import { ItemError } from "./item-repository";
import { createItemService, type ItemServiceDependencies } from "./item-service";

export type ItemRouteDependencies = ItemServiceDependencies & { appUrl: string; authRepository: AuthRepository; now: () => Date };
export function createItemHandlers(deps: ItemRouteDependencies) {
  const service = createItemService(deps);
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
        if (error instanceof ItemError) {
          if (error.code === "NOT_FOUND") return apiError(error.code, 404, "The item or image was not found.");
          if (error.code === "INVALID_INPUT" || error.code === "INVALID_IMAGE") return apiError(error.code, 400, "The request does not meet the requirements.");
          return apiError(error.code, 409, "The item is incomplete or cannot be changed.");
        }
        return apiError("INTERNAL_ERROR", 500, "The request could not be completed.");
      }
    };
  return {
    create: authenticated(true, async (userId, body) => jsonResponse({ item: await service.createDraft(userId, body) }, 201)),
    read: authenticated(false, async (userId, _body, id) => jsonResponse({ item: await service.readItem(userId, id) })),
    update: authenticated(true, async (userId, body, id) => jsonResponse({ item: await service.updateItem(userId, id, body) })),
    activate: authenticated(true, async (userId, body, id) => jsonResponse({ item: await service.activateItem(userId, id, body) })),
    attach: authenticated(true, async (userId, body, id) => {
      const parsed = z.strictObject({ uploadId: z.uuid() }).safeParse(body);
      if (!parsed.success) throw new ItemError("INVALID_INPUT");
      await service.attachOriginal(userId, id, parsed.data.uploadId);
      return jsonResponse({ ok: true });
    }),
  };
}
