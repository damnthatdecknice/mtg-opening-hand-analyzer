import assert from "node:assert/strict";
import {
  classifyDetection,
  clusterDuplicateCandidates,
  filterCardCandidates,
  fitSevenCardRow,
  scaleRects
} from "../src/lib/mtgoHandDetector";

function candidate(x: number, y: number, width: number, height: number, area = width * height * 0.2) {
  return { x, y, width, height, area };
}

const imageWidth = 1920;
const imageHeight = 1080;

const row = Array.from({ length: 7 }, (_, index) =>
  candidate(190 + index * 162, 815 + (index % 2) * 2, 145 + (index === 3 ? 5 : 0), 204)
);

const filtered = filterCardCandidates(
  [
    ...row,
    candidate(20, 35, 80, 120),
    candidate(1730, 545, 80, 112),
    candidate(10, 835, 220, 30),
    candidate(1200, 850, 12, 80)
  ],
  imageWidth,
  imageHeight
);

assert.equal(filtered.length, 7, "candidate filtering keeps the seven hand cards and rejects obvious UI noise");

const clustered = clusterDuplicateCandidates([
  candidate(190, 815, 145, 204),
  candidate(195, 819, 138, 194),
  candidate(352, 815, 145, 204)
]);

assert.equal(clustered.length, 2, "nested or duplicate card contours collapse to one candidate per slot");

const fit = fitSevenCardRow(row, imageWidth, imageHeight);
assert.ok(fit, "regular MTGO hand rows fit a seven-slot model");
assert.equal(fit?.cards.length, 7);
assert.equal(fit?.matchedSlots, 7);
assert.ok((fit?.score ?? 0) > 650);
assert.equal(classifyDetection(fit?.matchedSlots ?? 0, fit?.score ?? 0, fit?.dimensionSpread ?? 1, fit?.spacingSpread ?? 1), "high");

const missingOne = row.filter((_, index) => index !== 4);
const inferredFit = fitSevenCardRow(missingOne, imageWidth, imageHeight);
assert.ok(inferredFit, "row fitting infers a missing card from the other six slots");
assert.equal(inferredFit?.cards.length, 7);
assert.equal(inferredFit?.matchedSlots, 6);
assert.notEqual(classifyDetection(inferredFit?.matchedSlots ?? 0, inferredFit?.score ?? 0, inferredFit?.dimensionSpread ?? 1, inferredFit?.spacingSpread ?? 1), "low");

const noisyRows = [
  ...row,
  candidate(1780, 550, 72, 101),
  candidate(45, 610, 95, 132),
  candidate(1680, 900, 68, 95)
];
const noisyFit = fitSevenCardRow(noisyRows, imageWidth, imageHeight);
assert.ok(noisyFit, "commander cards, avatars, and side-panel cards do not beat the lower seven-card row");
assert.equal(noisyFit?.matchedSlots, 7);
assert.ok((noisyFit?.cards[0].y ?? 0) > imageHeight * 0.7);

const scaled = scaleRects([{ x: 10, y: 20, width: 30, height: 40 }], 100, 100, 200, 300);
assert.deepEqual(scaled[0], { x: 20, y: 60, width: 60, height: 120 });

console.log("mtgoHandDetector tests passed");
