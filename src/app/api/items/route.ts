import { bindProductionItemHandler, listProductionItems } from "@/server/items";
export const runtime = "nodejs";
export const POST = bindProductionItemHandler("create");
export const GET = listProductionItems;
