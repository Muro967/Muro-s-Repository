import { BrandHeader } from "@/components/brand/brand-header";
import { AppShell } from "@/components/navigation/app-shell";

export default function RootPage() {
  return (
    <AppShell activeTab="wardrobe">
      <BrandHeader />
    </AppShell>
  );
}
