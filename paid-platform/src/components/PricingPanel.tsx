"use client";

import Link from "next/link";
import { OPEN_BETA_ACCESS, SUBSCRIPTION_TIERS } from "@/lib/subscriptions";
import { useEntitlements } from "@/components/useEntitlements";

export function PricingPanel() {
  const entitlements = useEntitlements();

  return (
    <section className="pricing-page">
      <header className="panel dashboard-header">
        <p className="eyebrow">Subscription tiers</p>
        <h1>Choose Your Workspace</h1>
        <p>
          {OPEN_BETA_ACCESS
            ? "Opening Edge is in open beta, so every account can use the analyzer, saved decks, mana curve, and metagame tools while we prepare billing for a later launch."
            : "Free includes 10 analyzer uses per week. Deck Pro unlocks unlimited analysis, saved decklists, and the remembered deck workflow for competitive testing."}
        </p>
      </header>

      <div className="pricing-grid">
        {SUBSCRIPTION_TIERS.map((tier) => {
          const isCurrent =
            entitlements.tierId === tier.id ||
            (entitlements.tierId === "permanent" && tier.id === "deck_pro");
          return (
            <article className={tier.id === "deck_pro" ? "panel pricing-card featured" : "panel pricing-card"} key={tier.id}>
              <p className="eyebrow">{tier.label}</p>
              <h2>{tier.price}</h2>
              <p className="muted-copy">{tier.description}</p>
              <ul className="feature-list">
                {tier.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              {OPEN_BETA_ACCESS && tier.id !== "free" ? (
                <span className="plan-pill">Included during beta</span>
              ) : isCurrent ? (
                <span className="plan-pill">
                  {entitlements.isPermanent ? "Permanent access" : "Current plan"}
                </span>
              ) : tier.id === "deck_pro" ? (
                <button className="primary-button" type="button">
                  Upgrade to Deck Pro
                </button>
              ) : (
                <button className="secondary-button" type="button">
                  {tier.id === "free" ? "Included" : "Coming soon"}
                </button>
              )}
            </article>
          );
        })}
      </div>

      <section className="panel compact-panel pricing-note">
        <p className="eyebrow">Billing note</p>
        <p>
          {OPEN_BETA_ACCESS
            ? "Payment is intentionally disabled during open beta. The tier and entitlement architecture remains in place so Stripe checkout can be wired in when Opening Edge is ready to go paid."
            : "Stripe checkout is the next wiring step. For now, permanent/test access is handled inside the app entitlement layer."}
        </p>
        <Link className="text-link" href="/analyzer">
          Back to analyzer
        </Link>
      </section>
    </section>
  );
}
