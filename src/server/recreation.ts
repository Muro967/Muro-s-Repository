import "server-only";

import { createRecreationHandlers } from "@/features/recreation/recreation-routes";
import { DrizzleRecreationRepository } from "@/server/db/drizzle-recreation-repository";

import { getProductionAuthRouteDependencies } from "./auth";
import { getDb } from "./db/client";
import { apiError } from "./http/json";

type Context = { params: Promise<Record<string, string>> };

function handlers() {
  const auth = getProductionAuthRouteDependencies();
  return createRecreationHandlers({
    appUrl: auth.appUrl,
    authRepository: auth.repository,
    now: auth.now,
    repository: new DrizzleRecreationRepository(getDb()),
  });
}

export function bindProductionRecreation(action: "create" | "read") {
  return async (request: Request, context: Context) => {
    try {
      const params = await context.params;
      const id = action === "create" ? params.inspirationId : params.recreationId;
      if (typeof id !== "string") return apiError("NOT_FOUND", 404, "The recreation was not found.");
      return action === "create" ? handlers().create(request, id) : handlers().read(request, id);
    } catch {
      return apiError("INTERNAL_ERROR", 500, "The request could not be completed.");
    }
  };
}
