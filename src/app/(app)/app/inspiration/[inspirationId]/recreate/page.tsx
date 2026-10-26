import { DetailShell } from "@/components/navigation/detail-shell";
import { RecreationBuilder } from "@/features/recreation/recreation-builder";

export default async function RecreationBuilderPage({ params }: { params: Promise<{ inspirationId: string }> }) {
  const { inspirationId } = await params;
  return <DetailShell backHref={`/app/inspiration/${inspirationId}`} backLabel="灵感"><RecreationBuilder inspirationId={inspirationId} /></DetailShell>;
}
