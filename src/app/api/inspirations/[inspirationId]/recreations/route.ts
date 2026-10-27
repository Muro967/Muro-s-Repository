import { bindProductionRecreation } from "@/server/recreation";

export const runtime = "nodejs";
export const POST = bindProductionRecreation("create");
