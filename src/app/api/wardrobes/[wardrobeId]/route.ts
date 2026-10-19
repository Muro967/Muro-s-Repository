import { bindProductionWardrobeHandler } from "@/server/wardrobe";
export const runtime = "nodejs";
export const PATCH = bindProductionWardrobeHandler("renameWardrobe");
export const DELETE = bindProductionWardrobeHandler("deleteWardrobe");
