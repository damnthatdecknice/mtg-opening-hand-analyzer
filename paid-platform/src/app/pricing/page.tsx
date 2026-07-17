import { AuthGuard } from "@/components/AuthGuard";
import { PricingPanel } from "@/components/PricingPanel";

export default function PricingPage() {
  return (
    <AuthGuard>
      <PricingPanel />
    </AuthGuard>
  );
}
