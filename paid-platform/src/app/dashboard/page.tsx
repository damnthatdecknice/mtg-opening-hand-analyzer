import { AuthGuard } from "@/components/AuthGuard";
import { DashboardContent } from "@/components/DashboardContent";

export default function Dashboard() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  );
}
