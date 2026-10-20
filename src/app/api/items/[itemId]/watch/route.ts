import { bindProductionIdleHandler } from "@/server/idle";
export const runtime = "nodejs";
export const POST = bindProductionIdleHandler("startWatching");
export const DELETE = bindProductionIdleHandler("cancelWatching");
