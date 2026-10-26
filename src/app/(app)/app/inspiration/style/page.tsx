import { DetailShell } from "@/components/navigation/detail-shell";
import { StyleManual } from "@/features/style/style-manual";

export default function StyleManualPage() {
  return <DetailShell backHref="/app/inspiration" backLabel="灵感"><StyleManual /></DetailShell>;
}
