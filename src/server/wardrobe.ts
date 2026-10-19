import "server-only";
import { createWardrobeHandlers } from "@/features/wardrobe/wardrobe-routes";
import { getProductionAuthRouteDependencies } from "./auth";
import { getDb } from "./db/client";
import { DrizzleWardrobeRepository } from "./db/drizzle-wardrobe-repository";
import { apiError } from "./http/json";

type Action = keyof ReturnType<typeof createWardrobeHandlers>;
type RootAction = "list" | "createWardrobe" | "reorderWardrobes";
type WardrobeAction = "renameWardrobe" | "deleteWardrobe" | "createZone" | "reorderZones";
type ZoneAction = "renameZone" | "deleteZone";
type Context<K extends string> = { params: Promise<Record<K, string>> };
export function bindProductionWardrobeHandler(action: RootAction): (request: Request) => Promise<Response>;
export function bindProductionWardrobeHandler(action: WardrobeAction): (request: Request, context: Context<"wardrobeId">) => Promise<Response>;
export function bindProductionWardrobeHandler(action: ZoneAction): (request: Request, context: Context<"zoneId">) => Promise<Response>;
export function bindProductionWardrobeHandler(action: Action) {
  return async (request: Request, context?: Context<"wardrobeId"> | Context<"zoneId">): Promise<Response> => {
    try {
      const auth = getProductionAuthRouteDependencies();
      const handlers = createWardrobeHandlers({ appUrl: auth.appUrl, authRepository: auth.repository, now: auth.now, repository: new DrizzleWardrobeRepository(getDb()) });
      if (action === "list" || action === "createWardrobe" || action === "reorderWardrobes") return await handlers[action](request);
      if (!context?.params) return apiError("INTERNAL_ERROR", 500, "The request could not be completed.");
      const params = await context.params;
      const id = "zoneId" in params ? params.zoneId : params.wardrobeId;
      if (typeof id !== "string" || !id) return apiError("NOT_FOUND", 404, "The location was not found.");
      return await handlers[action](request, id);
    } catch { return apiError("INTERNAL_ERROR", 500, "The request could not be completed."); }
  };
}
