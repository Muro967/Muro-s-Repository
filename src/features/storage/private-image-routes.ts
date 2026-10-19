import "server-only";
import { z } from "zod";
import { readSession } from "@/features/auth/auth-service";
import { requestSessionToken } from "@/features/auth/session-cookie";
import type { ItemRouteDependencies } from "@/features/items/item-routes";
import { apiError } from "@/server/http/json";

export function createPrivateImageHandler(deps: Pick<ItemRouteDependencies, "authRepository" | "now" | "repository" | "provider">) {
  return async (request: Request, itemId: string, assetId: string): Promise<Response> => {
    const missing = () => apiError("NOT_FOUND", 404, "The item or image was not found.");
    try {
      const token = requestSessionToken(request);
      const user = token ? await readSession(token, deps.authRepository, deps.now()) : null;
      if (!user || !z.uuid().safeParse(itemId).success || !z.uuid().safeParse(assetId).success) return missing();
      const image = await deps.repository.findPrivateImage(user.id, itemId, assetId);
      if (!image) return missing();
      const stream = await deps.provider.openObject(image.objectKey);
      return new Response(stream, { headers: { "content-type": image.contentType, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
    } catch { return missing(); }
  };
}
