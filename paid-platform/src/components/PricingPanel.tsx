import { OPEN_BETA_ACCESS, SUBSCRIPTION_TIERS } from "@/lib/subscriptions";

export function PricingPanel() {
  return (
    <section className="pricing-page">
      <header className="panel dashboard-header">
        <p className="eyebrow">Open beta pricing</p>
        <h1>All Opening Edge features are currently free during open beta.</h1>
        <p>
          {OPEN_BETA_ACCESS
            ? "You can use opening-hand analysis, saved decks, mana curve tools, screenshot workflows, and metagame pages without payment while the product is in beta."
            : "Free includes 10 analyzer uses per week. Deck Pro unlocks unlimited analysis, saved decklists, and the remembered deck workflow for competitive testing."}
        </p>
      </header>

      <div className="pricing-grid">
        {SUBSCRIPTION_TIERS.map((tier) => (
          <article className={tier.id === "deck_pro" ? "panel pricing-card featured" : "panel pricing-card"} key={tier.id}>
            <p className="eyebrow">{tier.label}</p>
            <h2>{tier.id === "free" ? "Free during beta" : "Planned after beta"}</h2>
            <p className="muted-copy">{tier.description}</p>
            <ul className="feature-list">
              {tier.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <span className="plan-pill">{tier.id === "free" ? "Available now" : "Not yet available"}</span>
          </article>
        ))}
      </div>

      <section className="panel compact-panel pricing-note">
        <p className="eyebrow">Beta note</p>
        <p>
          {OPEN_BETA_ACCESS
            ? "Paid plans are planned for after the beta period. Current beta access is intended to help test the analyzer, deck tools, and metagame views with real player feedback."
            : "Paid plan availability will appear here when checkout is live."}
        </p>
      </section>
    </section>
  );
}
