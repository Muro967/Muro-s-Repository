import "server-only";
import { createIdleHandlers } from "@/features/idle/idle-routes";
import { getProductionAuthRouteDependencies } from "./auth";
import { getDb } from "./db/client";
import { DrizzleIdleRepository } from "./db/drizzle-idle-repository";
import { apiError } from "./http/json";

type RootAction = "readIdleDashboard" | "readIdleSettings" | "updateIdleSettings";
type ItemAction = "startWatching" | "cancelWatching" | "disposeItem";
type Context = { params: Promise<{ itemId: string }> };
export function bindProductionIdleHandler(action: RootAction): (request: Request) => Promise<Response>;
export function bindProductionIdleHandler(action: ItemAction): (request: Request, context: Context) => Promise<Response>;
export function bindProductionIdleHandler(action: RootAction | ItemAction) {
  return async (request: Request, routeContext?: Context) => {
    try {
      const auth = getProductionAuthRouteDependencies();
      const handlers = createIdleHandlers({ appUrl: auth.appUrl, authRepository: auth.repository, now: auth.now, repository: new DrizzleIdleRepository(getDb()) });
      // Next passes { params: undefined } to static routes as well.
      if (action === "readIdleDashboard" || action === "readIdleSettings" || action === "updateIdleSettings") return await handlers[action](request);
      const id = (await routeContext?.params)?.itemId;
      if (typeof id !== "string") return apiError("INTERNAL_ERROR", 500, "The request could not be completed.");
      return await handlers[action](request, id);
    } catch { return apiError("INTERNAL_ERROR", 500, "The request could not be completed."); }
  };
}
