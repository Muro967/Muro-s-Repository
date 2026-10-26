import { bindProductionAnalysisHandler } from "@/server/ai";

export const runtime = "nodejs";
export const POST = bindProductionAnalysisHandler();
