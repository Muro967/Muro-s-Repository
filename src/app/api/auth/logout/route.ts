import { createLogoutHandler } from "@/features/auth/auth-routes";
import { bindProductionAuthHandler } from "@/server/auth";

export const runtime = "nodejs";
export const POST = bindProductionAuthHandler(createLogoutHandler);
