import "server-only";

import { createStyleHandlers } from "@/features/style/style-routes";

import { getProductionAuthRouteDependencies } from "./auth";
import { getDb } from "./db/client";
import { DrizzleStyleRepository } from "./db/drizzle-style-repository";
import { apiError } from "./http/json";

function dependencies() {
  const auth = getProductionAuthRouteDependencies();
  return {
    appUrl: auth.appUrl,
    authRepository: auth.repository,
    now: auth.now,
    repository: new DrizzleStyleRepository(getDb()),
  };
}

type Handlers = ReturnType<typeof createStyleHandlers>;
type Context = { params: Promise<{ ruleId: string }> };

export function bindProductionStyleProfile(
  action: "read" | "regenerate" | "updateProfile",
) {
  return async (request: Request): Promise<Response> => {
    try {
      return await createStyleHandlers(dependencies())[action](request);
    } catch {
      return apiError("INTERNAL_ERROR", 500, "The request could not be completed.");
    }
  };
}

export function bindProductionStyleRule(action: "createRule"):
  (request: Request) => Promise<Response>;
export function bindProductionStyleRule(action: "updateRule" | "deleteRule"):
  (request: Request, context: Context) => Promise<Response>;
export function bindProductionStyleRule(
  action: "createRule" | "updateRule" | "deleteRule",
) {
  return async (request: Request, context?: Context): Promise<Response> => {
    try {
      const handlers: Handlers = createStyleHandlers(dependencies());
      if (action === "createRule") return await handlers.createRule(request);
      if (!context?.params) return apiError("NOT_FOUND", 404, "The style rule was not found.");
      const params = await context.params;
      if (!params || typeof params.ruleId !== "string") {
        return apiError("NOT_FOUND", 404, "The style rule was not found.");
      }
      return await handlers[action](request, params.ruleId);
    } catch {
      return apiError("INTERNAL_ERROR", 500, "The request could not be completed.");
    }
  };
}
