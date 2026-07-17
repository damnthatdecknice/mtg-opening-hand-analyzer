import { AuthGuard } from "@/components/AuthGuard";
import { SettingsPanel } from "@/components/SettingsPanel";

export default function SettingsPage() {
  return (
    <AuthGuard>
      <SettingsPanel />
    </AuthGuard>
  );
}
