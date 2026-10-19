import { DetailShell } from "@/components/navigation/detail-shell";
import { WardrobeManager } from "@/features/wardrobe/wardrobe-manager";

export default function WardrobesPage() {
  return <DetailShell><WardrobeManager /></DetailShell>;
}
