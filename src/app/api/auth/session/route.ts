import { createSessionHandler } from "@/features/auth/auth-routes";
import { bindProductionAuthHandler } from "@/server/auth";

export const runtime = "nodejs";
export const GET = bindProductionAuthHandler(createSessionHandler);
