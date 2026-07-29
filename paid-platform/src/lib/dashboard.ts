export type DashboardDeckCandidate = {
  id: string;
  name: string;
  updated_at?: string | null;
};

export function selectRecentDashboardDeck(
  decks: DashboardDeckCandidate[],
  recentSessionDeckId?: string | null
): DashboardDeckCandidate | null {
  if (!decks.length) {
    return null;
  }

  const sessionDeck = recentSessionDeckId ? decks.find((deck) => deck.id === recentSessionDeckId) : null;
  if (sessionDeck) {
    return sessionDeck;
  }

  return [...decks].sort((a, b) => {
    const bTime = b.updated_at ? Date.parse(b.updated_at) : 0;
    const aTime = a.updated_at ? Date.parse(a.updated_at) : 0;
    return bTime - aTime || a.name.localeCompare(b.name);
  })[0];
}
