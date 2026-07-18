import { DashboardActions } from "@/components/DashboardActions";
import { DashboardOverview } from "@/components/DashboardOverview";
import { DeckSummary } from "@/components/DeckSummary";

export function DashboardContent() {
  return (
    <section className="dashboard">
      <header className="dashboard-header panel">
        <p className="eyebrow">Opening Edge</p>
        <h1>Prepare Better. Mulligan Smarter.</h1>
        <p>
          Tools for opening-hand analysis, deck management, and metagame preparation.
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
