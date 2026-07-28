type DeckIdentity = {
  id: string;
};

export type AnalyzerDeckSelectionResult<TDeck extends DeckIdentity> = {
  deck: TDeck | null;
  message: string;
  shouldRemember: boolean;
};

export function selectAnalyzerDeck<TDeck extends DeckIdentity>({
  decks,
  rememberedDeckId,
  requestedDeckId
}: {
  decks: TDeck[];
  rememberedDeckId?: string | null;
  requestedDeckId?: string | null;
}): AnalyzerDeckSelectionResult<TDeck> {
  const cleanRequestedId = requestedDeckId?.trim() ?? "";
  const cleanRememberedId = rememberedDeckId?.trim() ?? "";

  if (cleanRequestedId) {
    const requestedDeck = decks.find((deck) => deck.id === cleanRequestedId) ?? null;
    return {
      deck: requestedDeck,
      message: requestedDeck ? "" : "That saved deck could not be found. Choose another deck or paste a list.",
      shouldRemember: Boolean(requestedDeck)
    };
  }

  if (cleanRememberedId) {
    const rememberedDeck = decks.find((deck) => deck.id === cleanRememberedId) ?? null;
    return {
      deck: rememberedDeck,
      message: "",
      shouldRemember: Boolean(rememberedDeck)
    };
  }

  return {
    deck: null,
    message: "",
    shouldRemember: false
  };
}
