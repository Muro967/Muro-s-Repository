import type { NextRequest } from "next/server";
import type { POST as createUpload } from "@/app/api/uploads/route";
import type { PUT as uploadContent } from "@/app/api/uploads/[uploadId]/content/route";
import type { POST as completeUpload } from "@/app/api/uploads/[uploadId]/complete/route";

type RouteHandler<Params> = (
  request: NextRequest,
  context: { params: Promise<Params> },
) => Promise<Response>;
type Assignable<Expected, Actual extends Expected> = Actual;
// Matches the generated Next validator's params: Promise<{}> for /api/uploads.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type CollectionRouteParams = {};

// Checked by tsc even before Next generates .next/types/validator.ts.
export type UploadRouteContracts = [
  Assignable<RouteHandler<CollectionRouteParams>, typeof createUpload>,
  Assignable<(request: Request) => Promise<Response>, typeof createUpload>,
  Assignable<RouteHandler<{ uploadId: string }>, typeof uploadContent>,
  Assignable<RouteHandler<{ uploadId: string }>, typeof completeUpload>,
  Assignable<
    [Request, { params: Promise<{ uploadId: string }> }],
    Parameters<typeof uploadContent>
  >,
  Assignable<
    [Request, { params: Promise<{ uploadId: string }> }],
    Parameters<typeof completeUpload>
  >,
];
