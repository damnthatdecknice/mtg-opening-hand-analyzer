export default function PrivacyPage() {
  return (
    <section className="panel compact-panel legal-page">
      <p className="eyebrow">Privacy</p>
      <h1>Privacy Policy</h1>
      <div className="legal-stack">
        <p>
          This app is built for Magic opening-hand analysis. It uses your decklists, confirmed hands,
          and optional screenshots to produce probabilities and recommendations.
        </p>
        <section>
          <h2>What We Store</h2>
          <p>
            Account features may store your email, saved decks, confirmed hand sessions, analysis
            results, subscription rank, and settings. Uploaded or pasted screenshots are processed for
            recognition and are not intentionally stored as permanent account records.
          </p>
        </section>
        <section>
          <h2>Third-Party Services</h2>
          <p>
            Card names are checked against Scryfall so the app can read mana values, card types, images,
            and rules text. Account and deck data are stored through the configured Supabase project.
          </p>
        </section>
        <section>
          <h2>Your Controls</h2>
          <p>
            Settings includes account-data deletion controls. You can also remove saved decks from the
            deck vault when that feature is available to your rank.
          </p>
        </section>
      </div>
    </section>
  );
}
