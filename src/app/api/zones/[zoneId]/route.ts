import { bindProductionWardrobeHandler } from "@/server/wardrobe";
export const runtime = "nodejs";
export const PATCH = bindProductionWardrobeHandler("renameZone");
export const DELETE = bindProductionWardrobeHandler("deleteZone");
