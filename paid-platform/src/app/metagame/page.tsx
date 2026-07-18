import { AuthGuard } from "@/components/AuthGuard";
import { MetagamePanel } from "@/components/MetagamePanel";

export default function MetagamePage() {
  return (
    <AuthGuard>
      <MetagamePanel />
    </AuthGuard>
  );
}
