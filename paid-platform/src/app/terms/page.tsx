export default function TermsPage() {
  return (
    <section className="panel compact-panel legal-page">
      <p className="eyebrow">Terms</p>
      <h1>Terms of Use</h1>
      <div className="legal-stack">
        <section>
          <h2>Analysis Is Advisory</h2>
          <p>
            The app provides probability estimates and sequencing guidance. It does not guarantee match
            outcomes, tournament results, or perfect card recognition.
          </p>
        </section>
        <section>
          <h2>Card Data</h2>
          <p>
            Magic card data is sourced from Scryfall when available. Lookup delays, rate limits, missing
            cards, or card-name mismatches may affect analysis until corrected by the user.
          </p>
        </section>
        <section>
          <h2>User Responsibility</h2>
          <p>
            Confirm screenshot-recognized cards before relying on results. Do not upload sensitive
            personal information in screenshots or deck notes.
          </p>
        </section>
      </div>
    </section>
  );
}
