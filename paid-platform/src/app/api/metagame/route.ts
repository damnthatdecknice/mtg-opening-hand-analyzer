import { NextRequest, NextResponse } from "next/server";
import {
  isMetagameFormat,
  type MetagameArchetype,
  type MetagameCardCount,
  type MetagameDeck,
  type MetagameEvent,
  type MetagameFormat,
  type MetagameResponse
} from "@/lib/metagame";

const mtgoRoot = "https://www.mtgo.com";
const windowDays = 7;
const eventNamePattern = /(challenge|showcase|qualifier|championship|premier|preliminary)/i;
const snapshotRevalidateSeconds = 60 * 60 * 24;
const cacheMs = 1000 * snapshotRevalidateSeconds;

type CacheEntry = {
  expiresAt: number;
  data: MetagameResponse;
};

type MtgoCard = {
  qty?: string;
  card_attributes?: {
    card_name?: string;
    card_type?: string;
    color?: string;
    colors?: string[];
  };
};

type MtgoDecklist = {
  player?: string;
  loginid?: string;
  main_deck?: MtgoCard[];
  sideboard?: MtgoCard[];
  side_board?: MtgoCard[];
};

type MtgoStanding = {
  loginid?: string;
  rank?: string;
};

type MtgoEventData = {
  description?: string;
  starttime?: string;
  format?: string;
  site_name?: string;
  decklists?: MtgoDecklist[];
  standings?: MtgoStanding[];
};

type IndexEvent = {
  name: string;
  url: string;
  date: string;
};

const cache = new Map<MetagameFormat, CacheEntry>();

export async function GET(request: NextRequest) {
  const requestedFormat = request.nextUrl.searchParams.get("format");
  const format = isMetagameFormat(requestedFormat) ? requestedFormat : "Modern";
  const cached = cache.get(format);

  if (cached && cached.expiresAt > Date.now()) {
    return metagameJson(cached.data);
  }

  try {
    const data = await buildMetagame(format);
    cache.set(format, {
      data,
      expiresAt: Date.now() + cacheMs
    });
    return metagameJson(data);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not build the metagame snapshot."
      },
      { status: 502 }
    );
  }
}

function metagameJson(data: MetagameResponse) {
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": `public, s-maxage=${snapshotRevalidateSeconds}, stale-while-revalidate=${snapshotRevalidateSeconds}`
    }
  });
}

async function buildMetagame(format: MetagameFormat): Promise<MetagameResponse> {
  const warnings: string[] = [];
  const indexEvents = await fetchRecentIndexEvents(format);
  const now = Date.now();
  const currentCutoff = now - windowDays * 24 * 60 * 60 * 1000;
  const previousCutoff = now - windowDays * 2 * 24 * 60 * 60 * 1000;
  const currentEvents = indexEvents.filter((event) => Date.parse(event.date) >= currentCutoff);
  const previousEvents = indexEvents.filter((event) => {
    const eventTime = Date.parse(event.date);
    return eventTime >= previousCutoff && eventTime < currentCutoff;
  });
  const currentSnapshot = await buildWindowSnapshot(format, currentEvents.slice(0, 8), warnings);
  const previousSnapshot = await buildWindowSnapshot(format, previousEvents.slice(0, 8), warnings);
  const archetypes = buildArchetypes(currentSnapshot.decks, previousSnapshot.decks, format);
  const topCards = buildTopCards(currentSnapshot.decks);

  return {
    format,
    generatedAt: new Date().toISOString(),
    source: "Official Magic Online decklists published at mtgo.com",
    windowDays,
    deckCount: currentSnapshot.decks.length,
    eventCount: currentSnapshot.events.length,
    events: currentSnapshot.events,
    archetypes,
    topCards,
    decks: currentSnapshot.decks,
    warnings
  };
}

async function buildWindowSnapshot(format: MetagameFormat, indexEvents: IndexEvent[], warnings: string[]) {
  const decks: MetagameDeck[] = [];
  const events: MetagameEvent[] = [];

  for (const event of indexEvents) {
    try {
      const data = await fetchEventData(event.url);
      const eventDecks = normalizeEventDecks(data, event.url, format);
      if (eventDecks.length) {
        events.push({
          name: data.description ?? event.name,
          date: toIsoDate(data.starttime ?? event.date),
          url: event.url,
          deckCount: eventDecks.length
        });
        decks.push(...eventDecks);
      }
    } catch (error) {
      warnings.push(`${event.name}: ${error instanceof Error ? error.message : "Could not parse event."}`);
    }
  }

  return { decks, events };
}

async function fetchRecentIndexEvents(format: MetagameFormat) {
  const html = await fetchText(`${mtgoRoot}/decklists`);
  const cutoff = Date.now() - windowDays * 2 * 24 * 60 * 60 * 1000;
  const events: IndexEvent[] = [];
  const eventRegex =
    /<a\s+href="(\/decklist\/[^"]+)"\s+class="decklists-link">[\s\S]*?<h3>([^<]+)<\/h3>[\s\S]*?<time\s+datetime="([^"]+)"/gi;

  let match = eventRegex.exec(html);
  while (match) {
    const href = match[1] ?? "";
    const name = decodeHtml(match[2] ?? "").trim();
    const date = match[3] ?? "";
    const timestamp = Date.parse(date);
    if (!href || !name || Number.isNaN(timestamp)) {
      match = eventRegex.exec(html);
      continue;
    }

    if (
      timestamp >= cutoff &&
      name.toLowerCase().includes(format.toLowerCase()) &&
      eventNamePattern.test(name) &&
      !/league/i.test(name)
    ) {
      events.push({
        name,
        date,
        url: `${mtgoRoot}${href}`
      });
    }

    match = eventRegex.exec(html);
  }

  return events.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}

async function fetchEventData(url: string) {
  const html = await fetchText(url);
  const marker = "window.MTGO.decklists.data = ";
  const start = html.indexOf(marker);
  if (start === -1) {
    throw new Error("MTGO did not expose structured decklist data.");
  }

  const jsonStart = html.indexOf("{", start);
  const jsonEnd = findObjectEnd(html, jsonStart);
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error("Structured decklist data was incomplete.");
  }

  return JSON.parse(html.slice(jsonStart, jsonEnd + 1)) as MtgoEventData;
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "MTG Opening Hand Pro metagame preview (+https://mtg-opening-hand-analyzer-hsjg.vercel.app)"
    },
    next: {
      revalidate: snapshotRevalidateSeconds
    }
  });

  if (!response.ok) {
    throw new Error(`MTGO returned ${response.status}.`);
  }

  return response.text();
}

function normalizeEventDecks(data: MtgoEventData, sourceUrl: string, format: MetagameFormat) {
  const standings = new Map(
    (data.standings ?? []).map((standing) => [standing.loginid, Number(standing.rank)])
  );

  return (data.decklists ?? []).map((deck) => {
    const main = normalizeCards(deck.main_deck ?? []);
    const sideboard = normalizeCards(deck.sideboard ?? deck.side_board ?? []);
    const colors = inferColors(deck.main_deck ?? []);
    return {
      player: deck.player ?? "Unknown player",
      eventName: data.description ?? "MTGO Event",
      eventDate: toIsoDate(data.starttime),
      format,
      archetype: classifyArchetype(main, colors),
      colors,
      rank: standings.get(deck.loginid),
      sourceUrl,
      main,
      sideboard
    } satisfies MetagameDeck;
  });
}

function normalizeCards(cards: MtgoCard[]) {
  return cards
    .map((card) => ({
      name: card.card_attributes?.card_name?.trim() ?? "",
      qty: Number(card.qty ?? 0),
      cardType: card.card_attributes?.card_type?.trim() ?? "",
      colors: normalizeCardColors(card.card_attributes?.colors ?? [])
    }))
    .filter((card) => card.name && card.qty > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeCardColors(colors: string[]) {
  return colors
    .map((color) => color.replace("COLOR_", "").toLowerCase())
    .filter((color) => ["white", "blue", "black", "red", "green"].includes(color))
    .map(colorLabel)
    .filter(Boolean)
    .sort((a, b) => "WUBRG".indexOf(a) - "WUBRG".indexOf(b));
}

function inferColors(cards: MtgoCard[]) {
  const colors = new Set<string>();
  for (const card of cards) {
    const type = card.card_attributes?.card_type ?? "";
    if (/LAND/i.test(type)) {
      continue;
    }

    for (const color of card.card_attributes?.colors ?? []) {
      const normalized = color.replace("COLOR_", "").toLowerCase();
      if (["white", "blue", "black", "red", "green"].includes(normalized)) {
        colors.add(colorLabel(normalized));
      }
    }
  }
  return Array.from(colors).sort((a, b) => "WUBRG".indexOf(a) - "WUBRG".indexOf(b));
}

function colorLabel(color: string) {
  return {
    white: "W",
    blue: "U",
    black: "B",
    red: "R",
    green: "G"
  }[color] ?? "";
}

function classifyArchetype(main: Array<{ name: string; qty: number }>, colors: string[]) {
  const names = new Set(main.map((card) => card.name.toLowerCase()));
  const has = (...needles: string[]) => needles.some((needle) => names.has(needle.toLowerCase()));
  const colorName = colors.length ? colors.join("") : "Colorless";

  if (has("Monastery Swiftspear", "Lightning Bolt", "Play with Fire") && colors.includes("R")) return `${colorName} Prowess/Aggro`;
  if (has("Arclight Phoenix")) return `${colorName} Phoenix`;
  if (has("Yorion, Sky Nomad", "Up the Beanstalk")) return `${colorName} Beanstalk`;
  if (has("Living End", "Crashing Footfalls")) return `${colorName} Cascade`;
  if (has("The One Ring", "Karn, the Great Creator", "Ugin, the Spirit Dragon")) return `${colorName} Big Mana`;
  if (has("Thoughtseize", "Fatal Push", "Orcish Bowmasters")) return `${colorName} Midrange`;
  if (has("Counterspell", "Teferi, Time Raveler", "Narset, Parter of Veils")) return `${colorName} Control`;
  if (has("Atraxa, Grand Unifier", "Leyline Binding", "Herd Migration")) return `${colorName} Domain`;
  if (has("Lotus Field", "Hidden Strings")) return `${colorName} Lotus Combo`;
  if (has("Show and Tell", "Sneak Attack")) return `${colorName} Sneak/Show`;
  if (has("Murktide Regent", "Dragon's Rage Channeler")) return `${colorName} Tempo`;
  if (has("Amalia Benavides Aguirre", "Wildgrowth Walker")) return `${colorName} Amalia Combo`;
  if (has("Greasefang, Okiba Boss")) return `${colorName} Greasefang`;

  const nonlandCount = main.reduce((sum, card) => sum + card.qty, 0);
  const creatureCount = main
    .filter((card) => /(guide|swiftspear|mouse|knight|goblin|elf|orc|dragon|druid|cat|soldier|vampire|beast|construct)/i.test(card.name))
    .reduce((sum, card) => sum + card.qty, 0);

  if (creatureCount >= nonlandCount * 0.35 && colors.includes("R")) return `${colorName} Aggro`;
  if (colors.length >= 4) return `${colorName} Good Stuff`;
  if (colors.length <= 2 && has("Force of Will", "Daze", "Brainstorm")) return `${colorName} Tempo`;

  return `${colorName} Other`;
}

function buildArchetypes(
  decks: MetagameDeck[],
  previousDecks: MetagameDeck[] = [],
  format: MetagameFormat = "Modern"
): MetagameArchetype[] {
  const normalizedDecks = applySimilarityArchetypes(decks, format);
  const normalizedPreviousDecks = applySimilarityArchetypes(previousDecks, format);
  const grouped = new Map<string, MetagameDeck[]>();
  for (const deck of normalizedDecks) {
    grouped.set(deck.archetype, [...(grouped.get(deck.archetype) ?? []), deck]);
  }
  const previousShares = buildArchetypeShares(normalizedPreviousDecks);

  return Array.from(grouped.entries())
    .map(([name, archetypeDecks]) => {
      const share = normalizedDecks.length ? archetypeDecks.length / normalizedDecks.length : 0;
      const previousShare = previousShares.get(name) ?? 0;
      return {
        name,
        decks: archetypeDecks.length,
        share,
        previousShare,
        change: share - previousShare,
        topCards: buildTopCards(archetypeDecks).slice(0, 5)
      };
    })
    .sort((a, b) => b.decks - a.decks || a.name.localeCompare(b.name));
}

function applySimilarityArchetypes(decks: MetagameDeck[], format: MetagameFormat) {
  const threshold = getSimilarityThreshold(format);
  const clusters: Array<{ label: string; representative: MetagameDeck; decks: MetagameDeck[] }> = [];

  for (const deck of decks) {
    const matchingCluster = clusters.find((cluster) => maindeckCopyOverlap(deck, cluster.representative) >= threshold);
    if (matchingCluster) {
      matchingCluster.decks.push(deck);
      continue;
    }

    clusters.push({
      label: deck.archetype,
      representative: deck,
      decks: [deck]
    });
  }

  for (const cluster of clusters) {
    cluster.label = chooseClusterLabel(cluster.decks);
  }

  return clusters.flatMap((cluster) => cluster.decks.map((deck) => ({ ...deck, archetype: cluster.label })));
}

function getSimilarityThreshold(format: MetagameFormat) {
  if (format === "Modern" || format === "Legacy") {
    return 40;
  }
  if (format === "Pioneer") {
    return 42;
  }
  return 45;
}

function maindeckCopyOverlap(left: MetagameDeck, right: MetagameDeck) {
  const rightCounts = new Map(right.main.map((card) => [card.name.toLowerCase(), card.qty]));
  return left.main.reduce((total, card) => {
    const rightQty = rightCounts.get(card.name.toLowerCase()) ?? 0;
    return total + Math.min(card.qty, rightQty);
  }, 0);
}

function chooseClusterLabel(decks: MetagameDeck[]) {
  const counts = new Map<string, number>();
  for (const deck of decks) {
    counts.set(deck.archetype, (counts.get(deck.archetype) ?? 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "Other";
}

function buildArchetypeShares(decks: MetagameDeck[]) {
  const counts = new Map<string, number>();
  for (const deck of decks) {
    counts.set(deck.archetype, (counts.get(deck.archetype) ?? 0) + 1);
  }
  return new Map(Array.from(counts.entries()).map(([name, count]) => [name, decks.length ? count / decks.length : 0]));
}

function buildTopCards(decks: MetagameDeck[]): MetagameCardCount[] {
  const copies = new Map<string, number>();
  const deckPresence = new Map<string, number>();

  for (const deck of decks) {
    const seen = new Set<string>();
    for (const card of deck.main) {
      if (isLandCard(card)) {
        continue;
      }
      copies.set(card.name, (copies.get(card.name) ?? 0) + card.qty);
      seen.add(card.name);
    }
    for (const card of Array.from(seen)) {
      deckPresence.set(card, (deckPresence.get(card) ?? 0) + 1);
    }
  }

  return Array.from(copies.entries())
    .map(([name, count]) => {
      const deckCount = deckPresence.get(name) ?? 0;
      return {
        name,
        count,
        decks: deckCount,
        share: decks.length ? deckCount / decks.length : 0
      };
    })
    .sort((a, b) => b.decks - a.decks || b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 30);
}

function isLandCard(card: { name: string; cardType?: string }) {
  if (/\bLand\b/i.test(card.cardType ?? "")) {
    return true;
  }
  return ["Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes"].includes(card.name);
}

function findObjectEnd(text: string, start: number) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function toIsoDate(value?: string) {
  if (!value) {
    return new Date().toISOString();
  }

  const normalized = value.includes("T") ? value : value.replace(" ", "T").replace(".0", "Z");
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString();
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
