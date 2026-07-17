import { AuthGuard } from "@/components/AuthGuard";
import { DeckLibrary } from "@/components/DeckLibrary";

export default function DecksPage() {
  return (
    <AuthGuard>
      <DeckLibrary />
    </AuthGuard>
  );
}
