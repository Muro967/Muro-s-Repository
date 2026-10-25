import { bindProductionInspirationHandler } from "@/server/inspiration";

export const runtime = "nodejs";
export const GET = bindProductionInspirationHandler("read");
export const PATCH = bindProductionInspirationHandler("update");
export const DELETE = bindProductionInspirationHandler("remove");
