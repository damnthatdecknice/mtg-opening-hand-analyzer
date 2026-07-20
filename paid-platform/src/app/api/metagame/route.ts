import { NextRequest, NextResponse } from "next/server";
import { createServerAnonSupabaseClient, isServerAnonSupabaseConfigured } from "@/lib/serverSupabase";
import {
  isMetagameFormat,
  isMetagameWindowDays,
  type MetagameArchetype,
  type MetagameCardCount,
  type MetagameDeck,
  type MetagameEvent,
  type MetagameFormat,
  type MetagameResponse,
  type MetagameWindowDays
} from "@/lib/metagame";

const mtgoRoot = "https://www.mtgo.com";
const signatureRuleTable = "metagame_signature_rules";
const eventNamePattern = /(challenge|showcase|qualifier|championship|premier|preliminary)/i;
const snapshotRevalidateSeconds = 60 * 60 * 24;
const cacheMs = 1000 * snapshotRevalidateSeconds;

const defaultSignatureRules: Array<MetagameSignatureRule & { format: MetagameFormat }> = [
  { format: "Modern", cardName: "Galvanic Discharge", archetypeName: "Jeskai Energy", requiredColors: ["W", "U", "R"], priority: 150 },
  { format: "Modern", cardName: "Galvanic Discharge", archetypeName: "Boros Energy", requiredColors: ["W", "R"], priority: 140 },
  { format: "Modern", cardName: "Mox Opal", archetypeName: "Affinity", requiredColors: ["U", "R"], priority: 130 },
  { format: "Modern", cardName: "Goryo's Vengeance", archetypeName: "Goryo's Vengeance", requiredColors: [], priority: 140 },
  { format: "Modern", cardName: "Thought-Knot Seer", archetypeName: "Eldrazi Tron", requiredColors: ["Colorless"], priority: 145 },
  { format: "Modern", cardName: "Manamorphose", archetypeName: "Ruby Storm", requiredColors: ["W", "R"], priority: 130 },
  { format: "Modern", cardName: "Monastery Swiftspear", archetypeName: "Izzet Prowess", requiredColors: ["U", "R"], priority: 130 },
  { format: "Modern", cardName: "Cleansing Wildfire", archetypeName: "Boros Ponza", requiredColors: ["W", "R"], priority: 120 },
  { format: "Modern", cardName: "Kozilek's Command", archetypeName: "RG Eldrazi", requiredColors: ["R", "G"], priority: 140 },
  { format: "Modern", cardName: "Abhorrent Oculus", archetypeName: "Grixis Reanimator", requiredColors: ["U", "B", "R"], priority: 130 },
  { format: "Modern", cardName: "Amulet of Vigor", archetypeName: "Amulet Titan", requiredColors: [], priority: 130 },
  { format: "Modern", cardName: "Solitude", archetypeName: "Esper Generic Blink", requiredColors: ["W", "U", "B"], priority: 120 },
  { format: "Modern", cardName: "Living End", archetypeName: "Living End", requiredColors: ["U", "B"], priority: 130 },
  { format: "Modern", cardName: "Territorial Kavu", archetypeName: "Domain Zoo", requiredColors: ["W", "U", "B", "R", "G"], priority: 130 },
  { format: "Modern", cardName: "Yawgmoth, Thran Physician", archetypeName: "Yawgmoth", requiredColors: [], priority: 130 },

  { format: "Standard", cardName: "Ouroboroid", archetypeName: "Selesnya Ouroboroid", requiredColors: ["W", "G"], priority: 130 },
  { format: "Standard", cardName: "Slickshot Show-Off", archetypeName: "Izzet Prowess", requiredColors: ["U", "R"], priority: 130 },
  { format: "Standard", cardName: "Jeskai Revelation", archetypeName: "Jeskai Lessons", requiredColors: ["W", "U", "R"], priority: 130 },
  { format: "Standard", cardName: "Tablet of Discovery", archetypeName: "4c Control", requiredColors: ["W", "U", "B", "R"], priority: 130 },
  { format: "Standard", cardName: "Eddymurk Crab", archetypeName: "Izzet Spellementals", requiredColors: ["U", "R"], priority: 130 },
  { format: "Standard", cardName: "Doomsday Excruciator", archetypeName: "Dimir Excruciator", requiredColors: ["U", "B"], priority: 130 },
  { format: "Standard", cardName: "Icetill Explorer", archetypeName: "Mono-Green Landfall", requiredColors: ["G"], priority: 130 },
  { format: "Standard", cardName: "Moonshadow", archetypeName: "Mardu Discard", requiredColors: ["W", "B", "R"], priority: 130 },
  { format: "Standard", cardName: "Gran-Gran", archetypeName: "Izzet Lessons", requiredColors: ["U", "R"], priority: 130 },
  { format: "Standard", cardName: "Mightform Harmonizer", archetypeName: "Selesnya Landfall", requiredColors: ["W", "G"], priority: 130 },
  { format: "Standard", cardName: "Brightglass Gearhulk", archetypeName: "4c Gearhulk", requiredColors: ["W", "U", "R", "G"], priority: 140 },
  { format: "Standard", cardName: "Hired Claw", archetypeName: "Mono-Red Aggro", requiredColors: ["R"], priority: 130 },
  { format: "Standard", cardName: "Slickshot Show-Off", archetypeName: "Izzet Spells", requiredColors: ["U", "R"], priority: 120 },
  { format: "Standard", cardName: "Momo, Friendly Flier", archetypeName: "Azorius Momo", requiredColors: ["W", "U"], priority: 130 },
  { format: "Standard", cardName: "Brightglass Gearhulk", archetypeName: "Selesnya Gearhulk", requiredColors: ["W", "G"], priority: 130 },

  { format: "Pioneer", cardName: "Monastery Swiftspear", archetypeName: "Izzet Prowess", requiredColors: ["U", "R"], priority: 140 },
  { format: "Pioneer", cardName: "Monastery Swiftspear", archetypeName: "Mono-Red Prowess", requiredColors: ["R"], priority: 130 },
  { format: "Pioneer", cardName: "Thoughtseize", archetypeName: "Golgari Midrange", requiredColors: ["B", "G"], priority: 130 },
  { format: "Pioneer", cardName: "No More Lies", archetypeName: "Azorius Control", requiredColors: ["W", "U"], priority: 130 },
  { format: "Pioneer", cardName: "Greasefang, Okiba Boss", archetypeName: "Abzan Greasefang", requiredColors: ["W", "B", "G"], priority: 140 },
  { format: "Pioneer", cardName: "Greasefang, Okiba Boss", archetypeName: "Orzhov Greasefang", requiredColors: ["W", "B"], priority: 130 },
  { format: "Pioneer", cardName: "Kaito, Bane of Nightmares", archetypeName: "Dimir Midrange", requiredColors: ["U", "B"], priority: 130 },
  { format: "Pioneer", cardName: "Arclight Phoenix", archetypeName: "Izzet Phoenix", requiredColors: ["U", "R"], priority: 130 },
  { format: "Pioneer", cardName: "Ouroboroid", archetypeName: "Selesnya Counters", requiredColors: ["W", "G"], priority: 130 },
  { format: "Pioneer", cardName: "Gran-Gran", archetypeName: "Izzet Lessons", requiredColors: ["U", "R"], priority: 130 },
  { format: "Pioneer", cardName: "Fatal Push", archetypeName: "Mono-Black Midrange", requiredColors: ["B"], priority: 120 },
  { format: "Pioneer", cardName: "Thoughtseize", archetypeName: "Dimir Aggro", requiredColors: ["U", "B"], priority: 130 },
  { format: "Pioneer", cardName: "Vivi Ornitier", archetypeName: "Izzet Midrange", requiredColors: ["U", "R"], priority: 130 },
  { format: "Pioneer", cardName: "Scapeshift", archetypeName: "5c Scapeshift", requiredColors: ["W", "U", "B", "R", "G"], priority: 140 },
  { format: "Pioneer", cardName: "Scapeshift", archetypeName: "Simic Scapeshift", requiredColors: ["U", "G"], priority: 130 },

  { format: "Legacy", cardName: "Daze", archetypeName: "Izzet Delver", requiredColors: ["U", "R"], priority: 130 },
  { format: "Legacy", cardName: "Thoughtseize", archetypeName: "Dimir Tempo", requiredColors: ["U", "B"], priority: 130 },
  { format: "Legacy", cardName: "Reanimate", archetypeName: "Rakdos Reanimator", requiredColors: ["U", "B", "R", "G"], priority: 130 },
  { format: "Legacy", cardName: "Doomsday", archetypeName: "Doomsday", requiredColors: ["U", "B", "G"], priority: 130 },
  { format: "Legacy", cardName: "Show and Tell", archetypeName: "Sneak and Show", requiredColors: ["U", "B", "R"], priority: 130 },
  { format: "Legacy", cardName: "Mox Opal", archetypeName: "Blue Artifacts", requiredColors: ["W", "U", "R"], priority: 130 },
  { format: "Legacy", cardName: "Life from the Loam", archetypeName: "Lands", requiredColors: ["W", "R", "G"], priority: 130 },
  { format: "Legacy", cardName: "Ocelot Pride", archetypeName: "Mardu Energy", requiredColors: ["W", "B", "R"], priority: 140 },
  { format: "Legacy", cardName: "Burning Wish", archetypeName: "The EPIC Storm", requiredColors: ["W", "U", "B", "R", "G"], priority: 130 },
  { format: "Legacy", cardName: "Ocelot Pride", archetypeName: "Boros Energy", requiredColors: ["W", "R"], priority: 130 },
  { format: "Legacy", cardName: "The Fantasticar", archetypeName: "Dimir Car", requiredColors: ["U", "B"], priority: 140 },
  { format: "Legacy", cardName: "Force of Will", archetypeName: "Azorius Control", requiredColors: ["W", "U"], priority: 120 },
  { format: "Legacy", cardName: "Painter's Servant", archetypeName: "Painter", requiredColors: ["U", "B", "R"], priority: 130 },
  { format: "Legacy", cardName: "Thought-Knot Seer", archetypeName: "Eldrazi", requiredColors: ["R"], priority: 130 },
  { format: "Legacy", cardName: "The Fantasticar", archetypeName: "Car Stompy", requiredColors: ["W"], priority: 130 }
];

type CacheEntry = {
  expiresAt: number;
  data: MetagameResponse;
};

type MetagameSignatureRule = {
  cardName: string;
  archetypeName: string;
  requiredColors: string[];
  priority: number;
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
  sideboard_deck?: MtgoCard[];
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

const cache = new Map<string, CacheEntry>();

export async function GET(request: NextRequest) {
  const requestedFormat = request.nextUrl.searchParams.get("format");
  const format = isMetagameFormat(requestedFormat) ? requestedFormat : "Modern";
  const requestedWindowDays = Number(request.nextUrl.searchParams.get("windowDays"));
  const windowDays = isMetagameWindowDays(requestedWindowDays) ? requestedWindowDays : 7;
  const cacheKey = `${format}:${windowDays}`;
  const cached = cache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return metagameJson(cached.data);
  }

  try {
    const data = await buildMetagame(format, windowDays);
    cache.set(cacheKey, {
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
      "Cache-Control": "no-store"
    }
  });
}

async function buildMetagame(format: MetagameFormat, windowDays: MetagameWindowDays): Promise<MetagameResponse> {
  const warnings: string[] = [];
  const signatureRules = await fetchSignatureRules(format);
  const indexEvents = await fetchRecentIndexEvents(format, windowDays);
  const now = Date.now();
  const currentCutoff = now - windowDays * 24 * 60 * 60 * 1000;
  const previousCutoff = now - windowDays * 2 * 24 * 60 * 60 * 1000;
  const currentEvents = indexEvents.filter((event) => Date.parse(event.date) >= currentCutoff);
  const previousEvents = indexEvents.filter((event) => {
    const eventTime = Date.parse(event.date);
    return eventTime >= previousCutoff && eventTime < currentCutoff;
  });
  const currentSnapshot = await buildWindowSnapshot(format, currentEvents.slice(0, 8), warnings, signatureRules);
  const previousSnapshot = await buildWindowSnapshot(format, previousEvents.slice(0, 8), warnings, signatureRules);
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

async function fetchSignatureRules(format: MetagameFormat) {
  const rules: MetagameSignatureRule[] = defaultSignatureRules
    .filter((rule) => rule.format === format)
    .map(({ cardName, archetypeName, requiredColors, priority }) => ({
      cardName,
      archetypeName,
      requiredColors,
      priority
    }));
  if (!isServerAnonSupabaseConfigured) {
    return sortSignatureRules(rules);
  }

  const supabase = createServerAnonSupabaseClient();
  if (!supabase) {
    return sortSignatureRules(rules);
  }

  const { data } = await supabase
    .from(signatureRuleTable)
    .select("card_name, archetype_name, required_colors, priority")
    .eq("format", format)
    .eq("is_active", true)
    .order("priority", { ascending: false });

  for (const row of data ?? []) {
    const cardName = typeof row.card_name === "string" ? row.card_name.trim() : "";
    const archetypeName = typeof row.archetype_name === "string" ? row.archetype_name.trim() : "";
    const requiredColors = Array.isArray(row.required_colors)
      ? row.required_colors.map((color) => String(color).trim().toUpperCase()).filter(Boolean)
      : [];
    const priority = Number(row.priority ?? 100);
    if (cardName && archetypeName) {
      rules.push({
        cardName,
        archetypeName,
        requiredColors,
        priority: Number.isFinite(priority) ? priority : 100
      });
    }
  }

  return sortSignatureRules(dedupeSignatureRules(rules));
}

function dedupeSignatureRules(rules: MetagameSignatureRule[]) {
  const seen = new Set<string>();
  return rules.filter((rule) => {
    const key = [
      rule.cardName.toLowerCase(),
      rule.archetypeName.toLowerCase(),
      [...rule.requiredColors].sort().join("")
    ].join("|");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function sortSignatureRules(rules: MetagameSignatureRule[]) {
  return [...rules].sort((a, b) => {
    const priorityDelta = b.priority - a.priority;
    if (priorityDelta) {
      return priorityDelta;
    }
    return colorSpecificity(b.requiredColors) - colorSpecificity(a.requiredColors);
  });
}

function colorSpecificity(requiredColors: string[]) {
  return requiredColors.includes("Colorless")
    ? 6
    : requiredColors.filter((color) => "WUBRG".includes(color)).length;
}

async function buildWindowSnapshot(
  format: MetagameFormat,
  indexEvents: IndexEvent[],
  warnings: string[],
  signatureRules: MetagameSignatureRule[]
) {
  const decks: MetagameDeck[] = [];
  const events: MetagameEvent[] = [];

  for (const event of indexEvents) {
    try {
      const data = await fetchEventData(event.url);
      const eventDecks = normalizeEventDecks(data, event.url, format, signatureRules);
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

async function fetchRecentIndexEvents(format: MetagameFormat, windowDays: MetagameWindowDays) {
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
      "user-agent": "Opening Edge metagame preview (+https://mtg-opening-hand-analyzer-hsjg.vercel.app)"
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

function normalizeEventDecks(
  data: MtgoEventData,
  sourceUrl: string,
  format: MetagameFormat,
  signatureRules: MetagameSignatureRule[]
) {
  const standings = new Map(
    (data.standings ?? []).map((standing) => [standing.loginid, Number(standing.rank)])
  );

  return (data.decklists ?? []).map((deck) => {
    const main = normalizeCards(deck.main_deck ?? []);
    const sideboard = normalizeCards(deck.sideboard_deck ?? deck.sideboard ?? deck.side_board ?? []);
    const colors = inferColors(deck.main_deck ?? []);
    return {
      player: deck.player ?? "Unknown player",
      eventName: data.description ?? "MTGO Event",
      eventDate: toIsoDate(data.starttime),
      format,
      archetype: classifyArchetype(main, colors, signatureRules),
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
    if (isLandType(type)) {
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

function classifyArchetype(
  main: Array<{ name: string; qty: number }>,
  colors: string[],
  signatureRules: MetagameSignatureRule[]
) {
  const names = new Set(main.map((card) => card.name.toLowerCase()));
  const has = (...needles: string[]) => needles.some((needle) => names.has(needle.toLowerCase()));
  const colorName = colors.length ? colors.join("") : "Colorless";
  const signatureMatch = signatureRules.find(
    (rule) =>
      names.has(rule.cardName.toLowerCase()) &&
      matchesRequiredColors(rule.requiredColors, colors)
  );

  if (signatureMatch) {
    return signatureMatch.archetypeName;
  }

  if (has("Goryo's Vengeance")) return "Goryo's Vengeance";
  if (has("Galvanic Discharge")) return "Boros Energy";
  if (has("Pinnacle Emissary")) return "Affinity";
  if (has("Thought-Knot Seer")) {
    if (colors.includes("R") && colors.includes("G")) return "GR Eldrazi";
    if (colors.includes("G")) return "G Eldrazi";
    return `${colorName} Eldrazi`;
  }
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

function matchesRequiredColors(requiredColors: string[], colors: string[]) {
  const normalized = requiredColors.map((color) => color.trim());
  if (normalized.includes("Colorless")) {
    return colors.length === 0;
  }
  return normalized.every((color) => colors.includes(color));
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
        sourceName: name,
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
  if (isLandType(card.cardType ?? "")) {
    return true;
  }
  return ["Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes"].includes(card.name);
}

function isLandType(cardType: string) {
  return /\bLand\b/i.test(cardType) || /\bLND\b/i.test(cardType);
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
