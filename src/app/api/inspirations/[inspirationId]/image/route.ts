import { bindProductionInspirationHandler } from "@/server/inspiration";

export const runtime = "nodejs";
export const GET = bindProductionInspirationHandler("image");
