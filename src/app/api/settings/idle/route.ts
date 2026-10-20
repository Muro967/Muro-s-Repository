import { bindProductionIdleHandler } from "@/server/idle";
export const runtime = "nodejs";
export const GET = bindProductionIdleHandler("readIdleSettings");
export const PATCH = bindProductionIdleHandler("updateIdleSettings");
