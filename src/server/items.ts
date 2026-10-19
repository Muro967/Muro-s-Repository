import "server-only";
import { createItemHandlers, type ItemRouteDependencies } from "@/features/items/item-routes";
import { createPrivateImageHandler } from "@/features/storage/private-image-routes";
import { getProductionAuthRouteDependencies } from "./auth";
import { getDb } from "./db/client";
import { DrizzleItemRepository } from "./db/drizzle-item-repository";
import { apiError } from "./http/json";
import { createStorageProvider } from "./storage";

export function getProductionItemDependencies(): ItemRouteDependencies {
  const auth = getProductionAuthRouteDependencies();
  return { appUrl: auth.appUrl, authRepository: auth.repository, now: auth.now,
    today: () => auth.now().toISOString().slice(0, 10), repository: new DrizzleItemRepository(getDb()), provider: createStorageProvider() };
}
type Action = keyof ReturnType<typeof createItemHandlers>;
type ItemContext = { params: Promise<{ itemId: string }> };
type ImageContext = { params: Promise<{ itemId: string; assetId: string }> };
export function bindProductionItemHandler(action: "create"): (request: Request) => Promise<Response>;
export function bindProductionItemHandler(action: Exclude<Action, "create">): (request: Request, context: ItemContext) => Promise<Response>;
export function bindProductionItemHandler(action: "image"): (request: Request, context: ImageContext) => Promise<Response>;
export function bindProductionItemHandler(action: Action | "image") {
  return async (request: Request, context?: ItemContext | ImageContext): Promise<Response> => {
    try {
      const deps = getProductionItemDependencies();
      if (action === "create") return await createItemHandlers(deps).create(request);
      if (!context?.params) return apiError("NOT_FOUND", 404, "The item or image was not found.");
      const params = await context.params;
      if (!params || typeof params.itemId !== "string") return apiError("NOT_FOUND", 404, "The item or image was not found.");
      if (action === "image") return await createPrivateImageHandler(deps)(request, params.itemId, "assetId" in params ? params.assetId : "");
      return await createItemHandlers(deps)[action](request, params.itemId);
    } catch { return apiError("INTERNAL_ERROR", 500, "The request could not be completed."); }
  };
}
