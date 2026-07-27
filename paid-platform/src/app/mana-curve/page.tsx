import { AuthGuard } from "@/components/AuthGuard";
import { ManaCurveDashboard } from "@/components/ManaCurveDashboard";

export default function ManaCurvePage() {
  return (
    <AuthGuard>
      <ManaCurveDashboard />
    </AuthGuard>
  );
}
