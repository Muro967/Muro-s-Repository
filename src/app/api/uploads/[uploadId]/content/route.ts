import { bindProductionUploadHandler } from "@/server/storage";
export const runtime = "nodejs";
export const PUT = bindProductionUploadHandler("put");
