import assert from "node:assert/strict";
import {
  buildScryfallCollectionRequest,
  scryfallExactNamePath,
  scryfallFetch
} from "../src/lib/scryfallClient";

async function main() {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  try {
    const collection = buildScryfallCollectionRequest([" Island ", "Mountain", "island", "", "Steam Vents"]);
    assert.deepEqual(
      collection.identifiers,
      [{ name: "Island" }, { name: "Mountain" }, { name: "Steam Vents" }],
      "collection identifiers are trimmed, nonempty, and de-duplicated case-insensitively"
    );
    assert.equal(
      collection.body,
      '{"identifiers":[{"name":"Island"},{"name":"Mountain"},{"name":"Steam Vents"}]}',
      "collection JSON is serialized exactly once"
    );
    assert.throws(
      () => buildScryfallCollectionRequest(["", "   "]),
      /at least one card name/i,
      "empty collection requests are rejected before transport"
    );
    assert.equal(
      buildScryfallCollectionRequest(Array.from({ length: 80 }, (_, index) => `Card ${index + 1}`)).identifiers.length,
      75,
      "collection requests respect the API maximum"
    );

    assert.equal(scryfallExactNamePath("Island"), "/cards/named?exact=Island");
    assert.equal(
      scryfallExactNamePath("Who // What // When // Where // Why"),
      "/cards/named?exact=Who+%2F%2F+What+%2F%2F+When+%2F%2F+Where+%2F%2F+Why",
      "exact-name lookups use URLSearchParams for punctuation and spaces"
    );
    assert.throws(() => scryfallExactNamePath("  "), /exact card name/i);

    await scryfallFetch(collection.path, {
      method: "POST",
      headers: { "x-opening-edge-test": "preserved" },
      body: collection.body
    });

    assert.equal(calls.length, 1, "one shared transport request is made");
    assert.equal(calls[0].url, "https://api.scryfall.com/cards/collection", "relative paths use the Scryfall API origin");
    assert.equal(calls[0].init?.method, "POST", "HTTP method is preserved");
    assert.equal(calls[0].init?.body, collection.body, "request body is preserved");
    const headers = new Headers(calls[0].init?.headers);
    assert.match(headers.get("accept") ?? "", /application\/json/, "requests explicitly accept JSON");
    assert.match(headers.get("user-agent") ?? "", /OpeningEdge/i, "server requests identify Opening Edge");
    assert.equal(headers.get("content-type"), "application/json", "JSON POST content type is supplied centrally");
    assert.equal(headers.get("x-opening-edge-test"), "preserved", "caller headers are preserved");

    await assert.rejects(
      () => scryfallFetch("https://example.com/cards/named?exact=Island"),
      /configured API origin/i,
      "the shared client rejects accidental requests to another origin"
    );
    assert.equal(calls.length, 1, "invalid origins never reach fetch");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main()
  .then(() => {
    console.log("scryfall client tests passed");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
