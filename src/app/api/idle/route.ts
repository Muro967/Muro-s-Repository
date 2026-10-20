import { bindProductionIdleHandler } from "@/server/idle";
export const runtime = "nodejs";
export const GET = bindProductionIdleHandler("readIdleDashboard");
