import { bindProductionWardrobeHandler } from "@/server/wardrobe";
export const runtime = "nodejs";
export const POST = bindProductionWardrobeHandler("createZone");
