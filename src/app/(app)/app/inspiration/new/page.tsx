import { DetailShell } from "@/components/navigation/detail-shell";
import { InspirationEditor } from "@/features/inspiration/inspiration-editor";

export default function NewInspirationPage() {
  return (
    <DetailShell backHref="/app/inspiration" backLabel="灵感">
      <InspirationEditor />
    </DetailShell>
  );
}
