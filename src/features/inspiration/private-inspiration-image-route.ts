import "server-only";

import { z } from "zod";

import { readSession } from "@/features/auth/auth-service";
import { requestSessionToken } from "@/features/auth/session-cookie";
import { apiError } from "@/server/http/json";

import type { InspirationRouteDependencies } from "./inspiration-routes";

export function createPrivateInspirationImageHandler(
  dependencies: Pick<
    InspirationRouteDependencies,
    "authRepository" | "now" | "repository" | "provider"
  >,
) {
  return async (request: Request, inspirationId: string): Promise<Response> => {
    const missing = () => apiError("NOT_FOUND", 404, "The inspiration or image was not found.");
    try {
      const token = requestSessionToken(request);
      const user = token
        ? await readSession(token, dependencies.authRepository, dependencies.now())
        : null;
      if (!user || !z.uuid().safeParse(inspirationId).success) return missing();
      const image = await dependencies.repository.findPrivateImage(user.id, inspirationId);
      if (!image) return missing();
      const stream = await dependencies.provider.openObject(image.objectKey);
      return new Response(stream, {
        headers: {
          "content-type": image.contentType,
          "cache-control": "private, no-store",
          "x-content-type-options": "nosniff",
        },
      });
    } catch {
      return missing();
    }
  };
}
