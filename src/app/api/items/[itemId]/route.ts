import { bindProductionItemHandler } from "@/server/items";
export const runtime = "nodejs";
export const GET = bindProductionItemHandler("read");
export const PATCH = bindProductionItemHandler("update");
