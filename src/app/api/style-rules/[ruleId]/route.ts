import { bindProductionStyleRule } from "@/server/style";

export const runtime = "nodejs";
export const PATCH = bindProductionStyleRule("updateRule");
export const DELETE = bindProductionStyleRule("deleteRule");
