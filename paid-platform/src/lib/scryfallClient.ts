const SCRYFALL_API_BASE_URL = "https://api.scryfall.com";

const SCRYFALL_ACCEPT_HEADER = "application/json;q=0.9,*/*;q=0.8";
const DEFAULT_SCRYFALL_USER_AGENT = "OpeningEdge/1.0";
const SCRYFALL_COLLECTION_LIMIT = 75;

export type ScryfallRequestOptions = {
  signal?: AbortSignal;
  method?: string;
  headers?: HeadersInit;
  body?: BodyInit;
};

export type ScryfallCollectionIdentifier = { name: string };

export function scryfallExactNamePath(cardName: string) {
  const exact = cardName.trim();
  if (!exact) {
    throw new Error("An exact card name is required.");
  }
  const query = new URLSearchParams({ exact });
  return `/cards/named?${query.toString()}`;
}

export function buildScryfallCollectionRequest(cardNames: string[]) {
  const seen = new Set<string>();
  const identifiers: ScryfallCollectionIdentifier[] = [];
  for (const rawName of cardNames) {
    const name = typeof rawName === "string" ? rawName.trim() : "";
    const key = name.toLocaleLowerCase();
    if (!name || seen.has(key)) {
      continue;
    }
    seen.add(key);
    identifiers.push({ name });
    if (identifiers.length === SCRYFALL_COLLECTION_LIMIT) {
      break;
    }
  }
  if (!identifiers.length) {
    throw new Error("At least one card name is required for a collection lookup.");
  }
  return {
    path: "/cards/collection",
    identifiers,
    body: JSON.stringify({ identifiers })
  };
}

function scryfallUrl(path: string) {
  if (/^https?:\/\//i.test(path)) {
    const url = new URL(path);
    if (url.origin !== SCRYFALL_API_BASE_URL) {
      throw new Error("Scryfall requests must use the configured API origin.");
    }
    return url.toString();
  }

  return new URL(path.startsWith("/") ? path : `/${path}`, SCRYFALL_API_BASE_URL).toString();
}

export async function scryfallFetch(path: string, options: ScryfallRequestOptions = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  const method = options.method?.toUpperCase();
  if (!headers.has("accept")) {
    headers.set("accept", SCRYFALL_ACCEPT_HEADER);
  }

  // Browsers own the User-Agent header. Server-side requests need an explicit,
  // identifiable value so Scryfall does not mistake them for anonymous bot traffic.
  if (typeof window === "undefined" && !headers.has("user-agent")) {
    headers.set("user-agent", process.env.SCRYFALL_USER_AGENT?.trim() || DEFAULT_SCRYFALL_USER_AGENT);
  }
  if (method === "POST" && typeof options.body === "string" && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  return fetch(scryfallUrl(path), {
    method,
    headers,
    body: options.body,
    signal: options.signal
  });
}
