import { DetailShell } from "@/components/navigation/detail-shell";
import { ItemEditor } from "@/features/items/item-editor";

export default async function EditItemPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  return <DetailShell><ItemEditor key={itemId} itemId={itemId} /></DetailShell>;
}
