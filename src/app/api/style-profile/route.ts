import { bindProductionStyleProfile } from "@/server/style";

export const runtime = "nodejs";
export const GET = bindProductionStyleProfile("read");
export const PUT = bindProductionStyleProfile("updateProfile");
export const POST = bindProductionStyleProfile("regenerate");
