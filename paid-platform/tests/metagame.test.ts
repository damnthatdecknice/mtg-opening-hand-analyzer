import assert from "node:assert/strict";
import { buildMetagameArchivePaths, isMatchingMetagameEventName } from "../src/lib/metagame";

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

assert.deepEqual(
  buildMetagameArchivePaths(Date.UTC(2026, 7, 3, 12), 7),
  ["/decklists/2026/08", "/decklists/2026/07"],
  "a 7-day August window and its prior comparison must include July"
);

assert.deepEqual(
  buildMetagameArchivePaths(Date.UTC(2026, 7, 3, 12), 30),
  ["/decklists/2026/08", "/decklists/2026/07", "/decklists/2026/06"],
  "a 30-day August window and its prior comparison must include all touched archive months"
);

assert.deepEqual(
  buildMetagameArchivePaths(Date.UTC(2026, 0, 2, 12), 7),
  ["/decklists/2026/01", "/decklists/2025/12"],
  "archive selection must cross year boundaries"
);

assert.deepEqual(
  buildMetagameArchivePaths(Date.UTC(2026, 7, 20, 12), 7),
  ["/decklists/2026/08"],
  "archive selection should not fetch an extra month when both windows fit in the current month"
);

console.log("metagame tests passed");
