import { bindProductionUploadHandler } from "@/server/storage";
export const runtime = "nodejs";
export const POST = bindProductionUploadHandler("create");
