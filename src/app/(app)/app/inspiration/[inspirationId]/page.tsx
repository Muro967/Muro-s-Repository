import { DetailShell } from "@/components/navigation/detail-shell";
import { InspirationEditor } from "@/features/inspiration/inspiration-editor";

export default async function InspirationDetailPage({
  params,
}: {
  params: Promise<{ inspirationId: string }>;
}) {
  const { inspirationId } = await params;
  return (
    <DetailShell backHref="/app/inspiration" backLabel="灵感">
      <InspirationEditor inspirationId={inspirationId} />
    </DetailShell>
  );
}
