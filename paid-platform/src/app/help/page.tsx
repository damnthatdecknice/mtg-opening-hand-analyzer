import Link from "next/link";

export default function HelpPage() {
  return (
    <section className="panel compact-panel legal-page">
      <p className="eyebrow">Support</p>
      <h1>Help and Troubleshooting</h1>
      <div className="legal-stack">
        <section>
          <h2>Scryfall Lookup Issues</h2>
          <p>
            The analyzer retries Scryfall requests, falls back from batch lookup to exact-card lookup,
            and keeps working when only part of a deck loads. If a card still fails, check spelling,
            punctuation, and whether the decklist uses an Arena-style card name.
          </p>
        </section>
        <section>
          <h2>Screenshot Recognition</h2>
          <p>
            Screenshot recognition compares deck-card images, extra print images, and browser OCR when
            available. If the top two answers conflict, use the quick choice buttons or the dropdown
            to correct the card before analysis.
          </p>
        </section>
        <section>
          <h2>Privacy Basics</h2>
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
