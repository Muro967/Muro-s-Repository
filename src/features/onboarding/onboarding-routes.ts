import "server-only";
import type { AuthRepository } from "@/features/auth/auth-repository";
import { readSession } from "@/features/auth/auth-service";
import { requestSessionToken } from "@/features/auth/session-cookie";
import { sessionUserSchema } from "@/features/auth/auth-routes";
import type { AppDatabase } from "@/server/db/types";
import { apiError, jsonResponse, readJsonBody, zodFields } from "@/server/http/json";
import { assertSameOrigin } from "@/server/http/origin";
import { completeOnboarding } from "./onboarding-service";
import { onboardingSchema } from "./onboarding-types";

export function createOnboardingHandler(deps: { appUrl: string; repository: AuthRepository; database: AppDatabase; now: () => Date }) {
  return async function POST(request: Request): Promise<Response> {
    try { assertSameOrigin(request, deps.appUrl); }
    catch { return apiError("ORIGIN_MISMATCH", 403, "Request origin is not allowed."); }
    try {
      const token = requestSessionToken(request);
      const user = token ? await readSession(token, deps.repository, deps.now()) : null;
      if (!user) return apiError("UNAUTHORIZED", 401, "Sign in to continue.");
      const body = await readJsonBody(request);
      if (!body.ok) return apiError("INVALID_INPUT", 400, "A valid JSON request body is required.");
      const parsed = onboardingSchema.safeParse(body.value);
      if (!parsed.success) return apiError("INVALID_INPUT", 400, "The request contains invalid fields.", zodFields(parsed.error));
      const updated = await completeOnboarding(deps.database, user.id, parsed.data, deps.now());
      return jsonResponse({ user: sessionUserSchema.parse(updated) });
    } catch { return apiError("INTERNAL_ERROR", 500, "The request could not be completed."); }
  };
}
