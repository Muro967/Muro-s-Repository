import { bindProductionIdleHandler } from "@/server/idle";
export const runtime = "nodejs";
export const POST = bindProductionIdleHandler("disposeItem");
