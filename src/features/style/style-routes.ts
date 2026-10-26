import "server-only";

import type { AuthRepository } from "@/features/auth/auth-repository";
import type { AiProvider } from "@/features/ai/ai-types";
import { readSession } from "@/features/auth/auth-service";
import { requestSessionToken } from "@/features/auth/session-cookie";
import { apiError, jsonResponse, readJsonBody } from "@/server/http/json";
import { assertSameOrigin } from "@/server/http/origin";

import { StyleError, type StyleRepository } from "./style-repository";
import { createStyleService } from "./style-service";

export type StyleRouteDependencies = {
  appUrl: string;
  authRepository: AuthRepository;
  now: () => Date;
  repository: StyleRepository;
  provider?: AiProvider | null;
};

export function createStyleHandlers(dependencies: StyleRouteDependencies) {
  const service = createStyleService(dependencies);
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
        if (!parsed.ok) return apiError("INVALID_INPUT", 400, "A valid JSON request body is required.");
        body = parsed.value;
      }
      return await action(user.id, body, id);
    } catch (error) {
      if (error instanceof StyleError) {
        if (error.code === "AI_UNAVAILABLE") return apiError("AI_UNAVAILABLE", 503, "AI is not configured.");
        if (error.code === "NOT_FOUND") return apiError("NOT_FOUND", 404, "The style resource was not found.");
        if (error.code === "INVALID_INPUT") return apiError("INVALID_INPUT", 400, "The request does not meet the requirements.");
        return apiError("VERSION_CONFLICT", 409, "The style manual has changed.");
      }
      return apiError("INTERNAL_ERROR", 500, "The request could not be completed.");
    }
  };

  return {
    read: authenticated(false, async (userId) => jsonResponse({ style: await service.read(userId) })),
    regenerate: authenticated(true, async (userId, body) => {
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new StyleError("INVALID_INPUT");
      }
      const keys = Object.keys(body);
      const mode = (body as Record<string, unknown>).mode;
      if (keys.some((key) => key !== "mode") || (mode !== undefined && mode !== "ai" && mode !== "rules")) throw new StyleError("INVALID_INPUT");
      return jsonResponse({ style: await service.regenerate(userId, mode === "ai" ? "ai" : "rules") });
    }),
    updateProfile: authenticated(true, async (userId, body) => {
      if (body && typeof body === "object" && !Array.isArray(body) && "action" in body) {
        const { action, ...input } = body as Record<string, unknown>;
        if (action !== "accept-suggestion") throw new StyleError("INVALID_INPUT");
        return jsonResponse({ style: await service.acceptSuggestion(userId, input) });
      }
      return jsonResponse({ style: await service.updateProfile(userId, body) });
    }),
    createRule: authenticated(true, async (userId, body) =>
      jsonResponse({ rule: await service.createRule(userId, body) }, 201)),
    updateRule: authenticated(true, async (userId, body, id) =>
      jsonResponse({ rule: await service.updateRule(userId, id, body) })),
    deleteRule: authenticated(true, async (userId, body, id) => {
      await service.deleteRule(userId, id, body);
      return jsonResponse({ ok: true });
    }),
  };
}
