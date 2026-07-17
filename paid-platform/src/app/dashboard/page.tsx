import { AuthGuard } from "@/components/AuthGuard";
import { DashboardOverview } from "@/components/DashboardOverview";
import { DeckSummary } from "@/components/DeckSummary";
import Link from "next/link";

export default function Dashboard() {
  return (
    <AuthGuard>
      <section className="dashboard">
        <header className="dashboard-header panel">
          <p className="eyebrow">Subscriber workspace</p>
          <h1>Player Command Center</h1>
          <p>
            Your saved decks, analyzer history, and subscription workspace live here
            while the beta app keeps moving separately.
          </p>
          <div className="action-row">
            <Link className="primary-button" href="/analyzer">
              Analyze a hand
            </Link>
            <Link className="secondary-button" href="/decks">
              Save decks
            </Link>
          </div>
        </header>

        <DashboardOverview />

        <div className="dashboard-grid">
          <DeckSummary />

          <section className="panel wide-panel">
            <div className="section-heading">
              <p className="eyebrow">Next build targets</p>
              <h2>What Comes First</h2>
            </div>
            <div className="roadmap">
              <span>Save hand sessions</span>
              <span>Deck storage live</span>
              <span>Analyzer history</span>
              <span>Stripe test mode</span>
            </div>
          </section>
        </div>
      </section>
    </AuthGuard>
  );
}
