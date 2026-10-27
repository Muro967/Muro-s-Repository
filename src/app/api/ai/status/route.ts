import { publicAiStatus, readAiEnv } from "@/features/ai/ai-provider";
import { jsonResponse } from "@/server/http/json";

export const runtime = "nodejs";
export function GET() {
  try { return jsonResponse(publicAiStatus(readAiEnv())); }
  catch { return jsonResponse({ available: false, label: "规则模式" }); }
}
