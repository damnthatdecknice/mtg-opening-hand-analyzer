import { AuthGuard } from "@/components/AuthGuard";
import { HandAnalyzer } from "@/components/HandAnalyzer";

export default function AnalyzerPage() {
  return (
    <AuthGuard>
      <HandAnalyzer />
    </AuthGuard>
  );
}
