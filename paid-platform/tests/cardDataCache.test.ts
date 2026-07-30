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

function sixtyCardNames() {
  return Array.from({ length: 60 }, (_, index) => `Test Card ${index + 1}`);
}

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
      assert.equal(calls.length, 2, "successful not_found responses are authoritative and do not trigger exact-card fallback");
    }
  );

  await withMockedFetch(
    async () => {
      throw new TypeError("Failed to fetch");
    },
    async (calls) => {
      const progress: number[] = [];
      const result = await fetchCardData(["Opt", "Consider"], { retryFailures: true });
      assert.equal(result.lookups.size, 0, "network failures do not create fake card data");
      assert.equal(result.failures.length, 0, "operation failures are not duplicated per requested card");
      assert.equal(result.operationFailure?.kind, "network", "network outages return one operation-level failure");
      assert.deepEqual(result.unresolvedCards, ["Opt", "Consider"], "operation failure preserves unresolved card names");
      assert.equal(calls.length, 3, "two-card outages make bounded batch requests and no individual requests");
      const retried = await fetchCardData(["Opt", "Consider"], {
        retryFailures: true,
        onProgress: (state) => progress.push(state.percent)
      });
      assert.equal(retried.operationFailure?.kind, "network", "explicit retry still fails as one operation");
      assert.deepEqual(progress, progress.slice().sort((a, b) => a - b), "progress remains monotonic during failure");
      assert.notEqual(progress.at(-1), 100, "progress does not jump to complete after operation failure");
    }
  );

  await withMockedFetch(
    async () => {
      throw new TypeError("Failed to fetch");
    },
    async (calls) => {
      const result = await fetchCardData(sixtyCardNames(), { retryFailures: true });
      assert.equal(result.operationFailure?.kind, "network", "large outages return one operation-level failure");
      assert.equal(calls.length, 3, "sixty-card outages do not fan out into per-card requests");
    }
  );

  await withMockedFetch(
    async () => jsonResponse({ object: "error" }, 429),
    async (calls) => {
      const result = await fetchCardData(["Opt", "Consider"], { retryFailures: true });
      assert.equal(result.operationFailure?.kind, "rate-limit", "429 is surfaced as a rate-limit operation failure");
      assert.equal(calls.length, 3, "429 performs bounded collection retries only");
    }
  );

  await withMockedFetch(
    async () => jsonResponse({ object: "error" }, 503),
    async (calls) => {
      const result = await fetchCardData(["Opt", "Consider"], { retryFailures: true });
      assert.equal(result.operationFailure?.kind, "server", "503 is surfaced as a server operation failure");
      assert.equal(calls.length, 3, "503 performs bounded collection retries only");
    }
  );

  await withMockedFetch(
    async (url) => {
      if (url.includes("/cards/collection")) {
        return jsonResponse({ data: [], not_found: [{ name: "Missing One" }, { name: "Missing Two" }] });
      }
      throw new Error(`Unexpected request: ${url}`);
    },
    async (calls) => {
      const result = await fetchCardData(["Missing One", "Missing Two"], { retryFailures: true });
      assert.equal(result.failures.length, 2, "successful not_found results still report each missing card");
      assert.equal(result.operationFailure, undefined, "not_found is not an operation outage");
      assert.equal(calls.length, 1, "successful not_found never triggers individual fallback");
    }
  );

  await withMockedFetch(
    async (url) => {
      if (url.includes("/cards/collection")) {
        return jsonResponse({ data: [], not_found: [] });
      }
      if (url.includes("/cards/named")) {
        return jsonResponse({ object: "error" }, 404);
      }
      throw new Error(`Unexpected request: ${url}`);
    },
    async (calls) => {
      const result = await fetchCardData(Array.from({ length: 8 }, (_, index) => `Omitted ${index + 1}`), { retryFailures: true });
      assert.equal(result.failures.length, 8, "anomalous omissions are reported");
      assert.equal(calls.filter((call) => call.url.includes("/cards/named")).length, 5, "anomalous fallback is capped at five");
      assert.equal(calls.length, 6, "anomalous fallback makes one batch request plus capped individual requests");
    }
  );

  await withMockedFetch(
    async () => {
      throw new TypeError("Failed to fetch");
    },
    async () => {
      const first = await fetchCardData(["Transient Outage"], { retryFailures: true });
      assert.equal(first.operationFailure?.kind, "network", "network operation failure is reported");
      const second = await fetchCardData(["Transient Outage"]);
      assert.equal(second.operationFailure?.kind, "network", "operation failures are not cached as per-card failures");
    }
  );

  await withMockedFetch(
    async (_url, init) => {
      init?.signal?.dispatchEvent(new Event("abort"));
      throw new DOMException("Aborted", "AbortError");
    },
    async (calls) => {
      const controller = new AbortController();
      controller.abort();
      await assert.rejects(
        () => fetchCardData(["Opt"], { signal: controller.signal }),
        /aborted/i,
        "abort before fetch rejects without retrying"
      );
      assert.equal(calls.length, 0, "abort before fetch makes no requests");
    }
  );

  await withMockedFetch(
    async (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      }),
    async (calls) => {
      const controller = new AbortController();
      const lookup = fetchCardData(["Opt"], { signal: controller.signal });
      controller.abort();
      await assert.rejects(() => lookup, /aborted/i, "abort during fetch rejects without retrying");
      assert.equal(calls.length, 1, "abort during fetch does not retry");
    }
  );

  await withMockedFetch(
    async () => {
      throw new TypeError("Failed to fetch");
    },
    async (calls) => {
      const controller = new AbortController();
      const lookup = fetchCardData(["Opt"], { signal: controller.signal });
      setTimeout(() => controller.abort(), 20);
      await assert.rejects(() => lookup, /aborted/i, "abort during backoff rejects");
      assert.equal(calls.length, 1, "abort during backoff stops the next request");
    }
  );

  let deadlineExpired = false;
  await withMockedFetch(
    async () => {
      deadlineExpired = true;
      return jsonResponse({ object: "error" }, 503);
    },
    async (calls) => {
      const originalNow = Date.now;
      Date.now = () => originalNow() + (deadlineExpired ? 13_000 : 0);
      try {
        const result = await fetchCardData(["Opt"], { retryFailures: true });
        assert.equal(result.operationFailure?.kind, "timeout", "request deadlines stop future retries");
        assert.equal(calls.length, 1, "deadline exhaustion stops after the first failed request");
      } finally {
        Date.now = originalNow;
      }
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
