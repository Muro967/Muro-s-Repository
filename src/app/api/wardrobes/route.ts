import { bindProductionWardrobeHandler } from "@/server/wardrobe";
export const runtime = "nodejs";
export const GET = bindProductionWardrobeHandler("list");
export const POST = bindProductionWardrobeHandler("createWardrobe");
