import { DetailShell } from "@/components/navigation/detail-shell";
import { RecreationResult } from "@/features/recreation/recreation-result";

export default async function RecreationResultPage({ params }: { params: Promise<{ inspirationId: string; recreationId: string }> }) {
  const { inspirationId, recreationId } = await params;
  return <DetailShell backHref={`/app/inspiration/${inspirationId}`} backLabel="灵感"><RecreationResult recreationId={recreationId} /></DetailShell>;
}
