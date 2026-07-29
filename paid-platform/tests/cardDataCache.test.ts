import assert from "node:assert/strict";
import { clearCardDataCacheForTests, fetchCardData } from "../src/lib/analyzer";

type FetchCall = {
  url: string;
  init?: RequestInit;
};

function scryfallCard(name: string, overrides: Record<string, unknown> = {}) {
  return {
    name,
    mana_cost: "{U}",
    cmc: 1,
    type_line: "Instant",
    oracle_text: "Draw a card.",
    colors: ["U"],
    image_uris: { normal: `https://img.test/${encodeURIComponent(name)}.jpg`, art_crop: `https://img.test/${encodeURIComponent(name)}-art.jpg` },
    legalities: { modern: "legal" },
    ...overrides
  };
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

async function withMockedFetch<T>(handler: (url: string, init?: RequestInit) => Promise<Response>, run: (calls: FetchCall[]) => Promise<T>) {
  const originalFetch = globalThis.fetch;
  const calls: FetchCall[] = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return handler(url, init);
  }) as typeof fetch;
  try {
    return await run(calls);
  } finally {
    globalThis.fetch = originalFetch;
    clearCardDataCacheForTests();
  }
}

clearCardDataCacheForTests();

async function main() {
  await withMockedFetch(
    async (url) => {
      if (url.includes("/cards/collection")) {
        return jsonResponse({ data: [scryfallCard("Opt")], not_found: [] });
      }
      throw new Error(`Unexpected request: ${url}`);
    },
    async (calls) => {
      const first = await fetchCardData(["Opt"]);
      const second = await fetchCardData(["Opt"]);
      assert.equal(first.failures.length, 0, "first lookup succeeds");
      assert.equal(second.lookups.get("opt")?.name, "Opt", "second lookup returns cached card");
      assert.equal(calls.length, 1, "successful card lookups are cached by requested name");
    }
  );

  await withMockedFetch(
    async (url) => {
      if (url.includes("/cards/collection")) {
        return jsonResponse({
          data: [
            scryfallCard("Fire // Ice", {
              layout: "split",
              card_faces: [
                { name: "Fire", mana_cost: "{1}{R}", cmc: 2, type_line: "Instant", oracle_text: "Fire deals 2 damage." },
                { name: "Ice", mana_cost: "{1}{U}", cmc: 2, type_line: "Instant", oracle_text: "Tap target permanent. Draw a card." }
              ]
            })
          ],
          not_found: []
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    },
    async (calls) => {
      await fetchCardData(["Fire // Ice"]);
      const faceLookup = await fetchCardData(["Fire"]);
      assert.equal(faceLookup.lookups.get("fire")?.name, "Fire // Ice", "face aliases resolve from the normalized cache");
      assert.equal(calls.length, 1, "face aliases do not refetch a cached physical card");
    }
  );

  await withMockedFetch(
    async (url) => {
      if (url.includes("/cards/collection")) {
        return jsonResponse({ data: [], not_found: [{ name: "Definitely Missing" }] });
      }
      if (url.includes("/cards/named")) {
        return jsonResponse({ object: "error", details: "not found" }, 404);
      }
      throw new Error(`Unexpected request: ${url}`);
    },
    async (calls) => {
      const first = await fetchCardData(["Definitely Missing"]);
      const second = await fetchCardData(["Definitely Missing"]);
      const retry = await fetchCardData(["Definitely Missing"], { retryFailures: true });
      assert.equal(first.failures.length, 1, "missing lookup returns one failure");
      assert.equal(second.failures.length, 1, "cached missing lookup still reports the failure");
      assert.equal(retry.failures.length, 1, "retry failure lookup reports the refreshed failure");
      assert.equal(calls.length, 4, "retry skips cached failure but cached failure prevents the intermediate refetch");
    }
  );

  await withMockedFetch(
    async (url) => {
      if (url.includes("/cards/collection")) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return jsonResponse({ data: [scryfallCard("Consider")], not_found: [] });
      }
      throw new Error(`Unexpected request: ${url}`);
    },
    async (calls) => {
      const [first, second] = await Promise.all([fetchCardData(["Consider"]), fetchCardData(["Consider"])]);
      assert.equal(first.lookups.get("consider")?.name, "Consider", "first concurrent lookup succeeds");
      assert.equal(second.lookups.get("consider")?.name, "Consider", "second concurrent lookup shares in-flight work");
      assert.equal(calls.length, 1, "concurrent identical lookups are de-duped while in flight");
    }
  );
}

void main()
  .then(() => {
    console.log("cardDataCache tests passed");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
