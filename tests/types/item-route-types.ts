import type { NextRequest } from "next/server";
import type { POST as create } from "@/app/api/items/route";
import type { GET as read, PATCH as update } from "@/app/api/items/[itemId]/route";
import type { POST as activate } from "@/app/api/items/[itemId]/activate/route";
import type { PUT as attach } from "@/app/api/items/[itemId]/original/route";
import type { GET as image } from "@/app/api/items/[itemId]/assets/[assetId]/content/route";

type Handler<P> = (request: NextRequest, context: { params: Promise<P> }) => Promise<Response>;
type Assignable<Expected, Actual extends Expected> = Actual;
export type ItemRouteContracts = [
  Assignable<(request: Request) => Promise<Response>, typeof create>,
  Assignable<Handler<{ itemId: string }>, typeof read>,
  Assignable<Handler<{ itemId: string }>, typeof update>,
  Assignable<Handler<{ itemId: string }>, typeof activate>,
  Assignable<Handler<{ itemId: string }>, typeof attach>,
  Assignable<Handler<{ itemId: string; assetId: string }>, typeof image>,
  Assignable<[Request, { params: Promise<{ itemId: string; assetId: string }> }], Parameters<typeof image>>,
];
