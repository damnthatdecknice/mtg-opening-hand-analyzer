import Link from "next/link";

export default function HelpPage() {
  return (
    <section className="panel compact-panel legal-page">
      <p className="eyebrow">Support</p>
      <h1>HOW TO</h1>
      <div className="legal-stack">
        <section>
          <h2>How To Use</h2>
          <p>
            Start by saving or pasting your deck, then enter a seven-card hand manually, choose a
            random seven, or add a screenshot. Confirm the seven cards before running analysis so the
            land math, castability, mulligan comparison, and metagame context are based on the actual
            hand you are considering.
          </p>
          <p>
            For Magic Online screenshots, importing a .dek file is preferred because it gives the app
            the exact card images to compare against. Screenshot recognition is still a first pass:
            the final card choices stay under your control.
          </p>
        </section>
        <section>
          <h2>Troubleshooting</h2>
          <p>
            If screenshot recognition is uncertain, use the quick choice buttons or dropdowns to
            correct the cards. If a deck does not parse cleanly, check that sideboard starts on its own
            line and that card names match normal Magic decklist spelling.
          </p>
          <p>
            Screenshots are processed in your browser. Decks and hand sessions are saved only when you
            use account features. Review the <Link href="/privacy">privacy page</Link> and{" "}
            <Link href="/terms">terms</Link> for the plain-language version.
          </p>
        </section>
      </div>
    </section>
  );
}
