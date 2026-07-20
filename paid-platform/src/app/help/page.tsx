import Link from "next/link";
import Image from "next/image";

export default function HelpPage() {
  return (
    <main className="legal-page help-page">
      <p className="eyebrow">Support</p>
      <h1>How To</h1>
      <section className="panel compact-panel">
        <div className="legal-stack">
          <h2>How to use Opening Edge</h2>
          <ol className="help-guide">
            <li>
              Click <strong>Save a Deck</strong> on the top bar.
              <figure className="help-shot">
                <Image
                  src="/help/save-a-deck-nav.png"
                  alt="Save a Deck button on the top navigation bar"
                  width={1390}
                  height={169}
                />
              </figure>
            </li>
            <li>Name your deck and select the deck&apos;s format.</li>
            <li>
              Click <strong>Import .dek</strong>, or paste the decklist in MTG Arena format in the
              box below.
              <figure className="help-shot">
                <Image
                  src="/help/deck-setup-import.png"
                  alt="Deck name, format, and Import .dek controls"
                  width={1675}
                  height={973}
                />
              </figure>
            </li>
            <li>
              Click <strong>Save deck</strong>.
              <figure className="help-shot">
                <Image
                  src="/help/save-deck-button.png"
                  alt="Save deck button below the decklist"
                  width={1179}
                  height={1411}
                />
              </figure>
            </li>
            <li>
              Click <strong>Analyzer</strong> on the top bar and select your deck from the dropdown.
              <figure className="help-shot">
                <Image
                  src="/help/analyzer-nav.png"
                  alt="Analyzer button on the top navigation bar"
                  width={925}
                  height={176}
                />
              </figure>
            </li>
            <li>
              Either click <strong>Hand</strong> to manually select your hand from the dropdowns, or
              click <strong>Screenshot</strong> to take a screenshot of Magic Online or MTG Arena.
            </li>
            <li>
              If you clicked <strong>Hand</strong>, click <strong>Use this hand and analyze</strong>.
            </li>
            <li>
              If you clicked <strong>Screenshot</strong>, select <strong>Magic Online</strong> or{" "}
              <strong>MTG Arena</strong>, then paste, upload, or click{" "}
              <strong>Capture MTGO Window</strong> / <strong>Capture MTGA Window</strong>. Your
              browser will request access to your screen; choose the game window you are actively
              playing in.
            </li>
            <li>
              Review the screenshot recognition below. Correct any cards using the dropdowns or the
              quick choice buttons below the cropped card images.
            </li>
            <li>
              Click <strong>Confirm crops and analyze</strong>.
            </li>
          </ol>
        </div>
      </section>
      <section className="panel compact-panel">
        <div className="legal-stack">
          <h2>Metagame</h2>
          <p>
            The Metagame page builds a recent tournament snapshot from official Magic Online Challenge
            decklists. Opening Edge groups similar decklists into archetypes, tracks which decks are
            rising or falling compared with the prior week, and highlights the nonland cards that show
            up most often across the field.
          </p>
          <p>
            For your saved decks, Opening Edge tunes the metagame scan around your exact decklist.
            Its color-aware sideboard discovery algorithm compares your cards, colors, and closest
            published archetype shells against the broader format. The result is a focused scouting
            list of potential sideboard cards that are actually showing up in decks like yours, or in
            colorless cards available to any deck.
          </p>
          <p>
            Treat the suggestions as a competitive testing queue, not an automatic import. The goal is
            to surface cards worth trying before your next league, challenge, or local event.
          </p>
        </div>
      </section>
      <section className="panel compact-panel">
        <div className="legal-stack">
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
        </div>
      </section>
    </main>
  );
}
