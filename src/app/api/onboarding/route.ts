import { createOnboardingHandler } from "@/features/onboarding/onboarding-routes";
import { getProductionAuthRouteDependencies } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { apiError } from "@/server/http/json";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    return await createOnboardingHandler({ ...getProductionAuthRouteDependencies(), database: getDb() })(request);
  } catch { return apiError("INTERNAL_ERROR", 500, "The request could not be completed."); }
}
