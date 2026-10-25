import "server-only";

import { createInspirationHandlers } from "@/features/inspiration/inspiration-routes";
import { createPrivateInspirationImageHandler } from "@/features/inspiration/private-inspiration-image-route";

import { getProductionAuthRouteDependencies } from "./auth";
import { getDb } from "./db/client";
import { DrizzleInspirationRepository } from "./db/drizzle-inspiration-repository";
import { apiError } from "./http/json";
import { createStorageProvider } from "./storage";

export function getProductionInspirationDependencies() {
  const auth = getProductionAuthRouteDependencies();
  return {
    appUrl: auth.appUrl,
    authRepository: auth.repository,
    now: auth.now,
    repository: new DrizzleInspirationRepository(getDb()),
    provider: createStorageProvider(),
  };
}

type Action = keyof ReturnType<typeof createInspirationHandlers>;
type InspirationContext = { params: Promise<{ inspirationId: string }> };

export function bindProductionInspirationHandler(
  action: "list" | "create",
): (request: Request) => Promise<Response>;
export function bindProductionInspirationHandler(
  action: Exclude<Action, "list" | "create"> | "image",
): (request: Request, context: InspirationContext) => Promise<Response>;
export function bindProductionInspirationHandler(action: Action | "image") {
  return async (
    request: Request,
    context?: InspirationContext,
  ): Promise<Response> => {
    try {
      const dependencies = getProductionInspirationDependencies();
      if (action === "list" || action === "create") {
        return await createInspirationHandlers(dependencies)[action](request);
      }
      if (!context?.params) {
        return apiError("NOT_FOUND", 404, "The inspiration or image was not found.");
      }
      const params = await context.params;
      if (!params || typeof params.inspirationId !== "string") {
        return apiError("NOT_FOUND", 404, "The inspiration or image was not found.");
      }
      if (action === "image") {
        return await createPrivateInspirationImageHandler(dependencies)(
          request,
          params.inspirationId,
        );
      }
      return await createInspirationHandlers(dependencies)[action](
        request,
        params.inspirationId,
      );
    } catch {
      return apiError("INTERNAL_ERROR", 500, "The request could not be completed.");
    }
  };
}
