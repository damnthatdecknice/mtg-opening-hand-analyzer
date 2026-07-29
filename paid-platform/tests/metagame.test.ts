import assert from "node:assert/strict";
import { isMatchingMetagameEventName } from "../src/lib/metagame";

assert.equal(
  isMatchingMetagameEventName("Modern Challenge 32", "Modern"),
  true,
  "Modern Challenge should match Modern"
);

assert.equal(
  isMatchingMetagameEventName("Premodern Challenge 32", "Modern"),
  false,
  "Premodern Challenge must not be included in Modern"
);

assert.equal(
  isMatchingMetagameEventName("Pioneer Showcase Challenge", "Pioneer"),
  true,
  "Pioneer Showcase Challenge should match Pioneer"
);

assert.equal(
  isMatchingMetagameEventName("Legacy Premier Event", "Legacy"),
  true,
  "Legacy Premier Event should match Legacy"
);

console.log("metagame tests passed");
