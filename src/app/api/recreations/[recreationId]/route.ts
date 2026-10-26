import { bindProductionRecreation } from "@/server/recreation";

export const runtime = "nodejs";
export const GET = bindProductionRecreation("read");
