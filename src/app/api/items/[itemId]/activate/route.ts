import { bindProductionItemHandler } from "@/server/items";
export const runtime = "nodejs";
export const POST = bindProductionItemHandler("activate");
