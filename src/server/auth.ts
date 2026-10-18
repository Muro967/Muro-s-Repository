import "server-only";

import type { AuthRouteDependencies } from "@/features/auth/auth-routes";
import { apiError } from "./http/json";
import { getProductionAuthRouteDependencies } from "./runtime/auth";

export { getProductionAuthRouteDependencies };

/** Resolve configuration on request, so builds never initialize the database. */
export function bindProductionAuthHandler(
  factory: (dependencies: AuthRouteDependencies) => (request: Request) => Promise<Response>,
) {
  return async (request: Request): Promise<Response> => {
    try {
      return await factory(getProductionAuthRouteDependencies())(request);
    } catch {
      return apiError("INTERNAL_ERROR", 500, "The request could not be completed.");
    }
  };
}
