import { AppShell } from "@/components/navigation/app-shell";
import { WardrobeBrowser } from "@/features/items/wardrobe-browser";
export default function WardrobePage() {
  return <AppShell activeTab="wardrobe"><WardrobeBrowser /></AppShell>;
}
