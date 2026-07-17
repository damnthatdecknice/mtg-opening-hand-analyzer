import { DashboardActions } from "@/components/DashboardActions";
import { DashboardOverview } from "@/components/DashboardOverview";
import { DeckSummary } from "@/components/DeckSummary";

export function DashboardContent() {
  return (
    <section className="dashboard">
      <header className="dashboard-header panel">
        <p className="eyebrow">Subscriber workspace</p>
        <h1>Player Command Center</h1>
        <p>
          Your saved decks, analyzer history, and subscription workspace live here
          while the beta app keeps moving separately.
        </p>
        <DashboardActions />
      </header>

      <DashboardOverview />

      <div className="dashboard-grid">
        <DeckSummary />
      </div>
    </section>
  );
}
