import { bindProductionInspirationHandler } from "@/server/inspiration";

export const runtime = "nodejs";
export const GET = bindProductionInspirationHandler("list");
export const POST = bindProductionInspirationHandler("create");
