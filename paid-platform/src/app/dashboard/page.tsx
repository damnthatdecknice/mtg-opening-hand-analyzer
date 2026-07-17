const savedDecks = [
  { name: "Dimir Midrange", format: "Standard", sessions: 18 },
  { name: "Boros Aggro", format: "Explorer", sessions: 11 },
  { name: "Golgari Ramp", format: "Pioneer", sessions: 7 }
];

const sessions = [
  { hand: "2 land, card selection", score: "Keep", rating: "+18" },
  { hand: "1 land, cantrips", score: "Close", rating: "-4" },
  { hand: "4 land, top-heavy", score: "Mulligan", rating: "+9" }
];

export default function Dashboard() {
  return (
    <section className="dashboard">
      <header className="dashboard-header panel">
        <p className="eyebrow">Subscriber workspace</p>
        <h1>Player Command Center</h1>
        <p>
          This is the paid-product dashboard shell: saved decks, session history,
          rating tracking, and subscription surfaces can be built here without
          disturbing the beta app.
        </p>
      </header>

      <div className="dashboard-metrics">
        <div className="metric-card">
          <span>Saved decks</span>
          <strong>3</strong>
        </div>
        <div className="metric-card">
          <span>Tracked hands</span>
          <strong>36</strong>
        </div>
        <div className="metric-card">
          <span>Current rating</span>
          <strong>1578</strong>
        </div>
        <div className="metric-card">
          <span>Plan</span>
          <strong>Beta Pro</strong>
        </div>
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="section-heading">
            <p className="eyebrow">Deck vault</p>
            <h2>Saved Decks</h2>
          </div>
          <div className="list-stack">
            {savedDecks.map((deck) => (
              <div className="list-row" key={deck.name}>
                <div>
                  <strong>{deck.name}</strong>
                  <span>{deck.format}</span>
                </div>
                <em>{deck.sessions} sessions</em>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="section-heading">
            <p className="eyebrow">Recent decisions</p>
            <h2>Hand Sessions</h2>
          </div>
          <div className="list-stack">
            {sessions.map((session) => (
              <div className="list-row" key={session.hand}>
                <div>
                  <strong>{session.hand}</strong>
                  <span>{session.score}</span>
                </div>
                <em>{session.rating}</em>
              </div>
            ))}
          </div>
        </section>

        <section className="panel wide-panel">
          <div className="section-heading">
            <p className="eyebrow">Next build targets</p>
            <h2>What Comes First</h2>
          </div>
          <div className="roadmap">
            <span>Accounts</span>
            <span>Deck storage</span>
            <span>Analyzer API</span>
            <span>Stripe test mode</span>
          </div>
        </section>
      </div>
    </section>
  );
}

