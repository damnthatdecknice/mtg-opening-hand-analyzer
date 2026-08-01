export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MtgoHandDetection = {
  cards: Rect[];
  matchedSlots: number;
  confidence: "high" | "medium" | "low";
  score: number;
  debugCandidates?: Rect[];
};

type Candidate = Rect & {
  area: number;
};

type RowFit = {
  cards: Rect[];
  matchedSlots: number;
  score: number;
  dimensionSpread: number;
  spacingSpread: number;
};

const CARD_ASPECT = 448 / 320;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function centerX(rect: Rect) {
  return rect.x + rect.width / 2;
}

function centerY(rect: Rect) {
  return rect.y + rect.height / 2;
}

function median(values: number[]) {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function scaleRects(rects: Rect[], fromWidth: number, fromHeight: number, toWidth: number, toHeight: number) {
  const scaleX = toWidth / fromWidth;
  const scaleY = toHeight / fromHeight;
  return rects.map((rect) => ({
    x: rect.x * scaleX,
    y: rect.y * scaleY,
    width: rect.width * scaleX,
    height: rect.height * scaleY
  }));
}

function rectDensity(componentPixels: number, rect: Rect) {
  const boxArea = Math.max(1, rect.width * rect.height);
  return componentPixels / boxArea;
}

export function filterCardCandidates(candidates: Candidate[], imageWidth: number, imageHeight: number) {
  return candidates.filter((candidate) => {
    const widthRatio = candidate.width / imageWidth;
    const aspect = candidate.height / Math.max(1, candidate.width);
    const topRatio = candidate.y / imageHeight;
    const density = rectDensity(candidate.area, candidate);
    return (
      widthRatio >= 0.032 &&
      widthRatio <= 0.135 &&
      aspect >= 1.05 &&
      aspect <= 1.85 &&
      topRatio >= 0.55 &&
      topRatio <= 0.94 &&
      density >= 0.035 &&
      candidate.width >= 24 &&
      candidate.height >= 40
    );
  });
}

export function clusterDuplicateCandidates(candidates: Candidate[]) {
  const sorted = [...candidates].sort((a, b) => a.x - b.x || a.y - b.y);
  const clusters: Candidate[][] = [];
  for (const candidate of sorted) {
    const cluster = clusters.find((items) => {
      const maxWidth = Math.max(candidate.width, ...items.map((item) => item.width));
      const maxHeight = Math.max(candidate.height, ...items.map((item) => item.height));
      return items.some(
        (item) =>
          Math.abs(centerX(item) - centerX(candidate)) < maxWidth * 0.18 &&
          Math.abs(centerY(item) - centerY(candidate)) < maxHeight * 0.15
      );
    });
    if (cluster) {
      cluster.push(candidate);
    } else {
      clusters.push([candidate]);
    }
  }

  return clusters.map((cluster) => {
    if (cluster.length === 1) {
      return cluster[0];
    }
    const medWidth = median(cluster.map((item) => item.width));
    const medHeight = median(cluster.map((item) => item.height));
    const medY = median(cluster.map(centerY));
    return [...cluster].sort((a, b) => {
      const aScore =
        Math.abs(a.width - medWidth) / Math.max(1, medWidth) +
        Math.abs(a.height - medHeight) / Math.max(1, medHeight) +
        Math.abs(centerY(a) - medY) / Math.max(1, medHeight);
      const bScore =
        Math.abs(b.width - medWidth) / Math.max(1, medWidth) +
        Math.abs(b.height - medHeight) / Math.max(1, medHeight) +
        Math.abs(centerY(b) - medY) / Math.max(1, medHeight);
      return aScore - bScore;
    })[0];
  });
}

function normalizeSlotRect(center: number, yCenter: number, width: number, imageWidth: number, imageHeight: number) {
  const height = width * CARD_ASPECT;
  const paddedWidth = width * 1.06;
  const paddedHeight = height * 1.04;
  return {
    x: clamp(center - paddedWidth / 2, 0, imageWidth - paddedWidth),
    y: clamp(yCenter - paddedHeight / 2, 0, imageHeight - paddedHeight),
    width: paddedWidth,
    height: paddedHeight
  };
}

function scoreRowFit(candidates: Candidate[], slotCenters: number[], rowY: number, rowWidth: number, rowHeight: number) {
  const used = new Set<number>();
  const assignments: Array<Candidate | undefined> = [];
  const xTolerance = rowWidth * 0.35;
  const yTolerance = rowHeight * 0.2;

  for (const slotCenter of slotCenters) {
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    candidates.forEach((candidate, index) => {
      if (used.has(index)) {
        return;
      }
      const dx = Math.abs(centerX(candidate) - slotCenter);
      const dy = Math.abs(centerY(candidate) - rowY);
      if (dx > xTolerance || dy > yTolerance) {
        return;
      }
      const dimensionPenalty =
        Math.abs(candidate.width - rowWidth) / Math.max(1, rowWidth) +
        Math.abs(candidate.height - rowHeight) / Math.max(1, rowHeight);
      const distance = dx / Math.max(1, rowWidth) + dy / Math.max(1, rowHeight) + dimensionPenalty * 0.35;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    if (bestIndex >= 0) {
      used.add(bestIndex);
      assignments.push(candidates[bestIndex]);
    } else {
      assignments.push(undefined);
    }
  }

  const matched = assignments.filter(Boolean) as Candidate[];
  const widths = matched.map((item) => item.width);
  const heights = matched.map((item) => item.height);
  const dimensionSpread =
    matched.length >= 2
      ? (Math.max(...widths) - Math.min(...widths)) / Math.max(1, median(widths)) +
        (Math.max(...heights) - Math.min(...heights)) / Math.max(1, median(heights))
      : 1;
  const observedCenters = matched.map(centerX).sort((a, b) => a - b);
  const observedSpacings = observedCenters.slice(1).map((value, index) => value - observedCenters[index]);
  const spacingSpread =
    observedSpacings.length >= 2
      ? (Math.max(...observedSpacings) - Math.min(...observedSpacings)) / Math.max(1, median(observedSpacings))
      : 0.5;
  const ySpread =
    matched.length >= 2
      ? (Math.max(...matched.map(centerY)) - Math.min(...matched.map(centerY))) / Math.max(1, rowHeight)
      : 0.5;

  const score =
    matched.length * 100 -
    dimensionSpread * 28 -
    spacingSpread * 35 -
    ySpread * 42 -
    assignments.filter((item) => !item).length * 7;

  return { assignments, matched, dimensionSpread, spacingSpread, score };
}

export function fitSevenCardRow(inputCandidates: Candidate[], imageWidth: number, imageHeight: number): RowFit | null {
  const candidates = clusterDuplicateCandidates(inputCandidates)
    .filter((candidate) => centerY(candidate) > imageHeight * 0.62)
    .sort((a, b) => a.x - b.x);

  if (candidates.length < 2) {
    return null;
  }

  let best: RowFit | null = null;
  const widths = candidates.map((candidate) => candidate.width);
  const heights = candidates.map((candidate) => candidate.height);
  const globalWidth = median(widths);
  const globalHeight = median(heights);

  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
      const left = candidates[leftIndex];
      const right = candidates[rightIndex];
      const observedSpacing = centerX(right) - centerX(left);
      if (observedSpacing <= 0) {
        continue;
      }
      for (let leftSlot = 0; leftSlot <= 5; leftSlot += 1) {
        for (let rightSlot = leftSlot + 1; rightSlot <= 6; rightSlot += 1) {
          const slotDistance = rightSlot - leftSlot;
          const spacing = observedSpacing / slotDistance;
          const spacingRatio = spacing / Math.max(1, globalWidth);
          if (spacingRatio < 0.82 || spacingRatio > 1.5) {
            continue;
          }
          const firstCenter = centerX(left) - spacing * leftSlot;
          const lastCenter = firstCenter + spacing * 6;
          if (firstCenter < -globalWidth * 0.8 || lastCenter > imageWidth + globalWidth * 0.8) {
            continue;
          }
          const slotCenters = Array.from({ length: 7 }, (_, index) => firstCenter + spacing * index);
          const nearby = candidates.filter((candidate) =>
            slotCenters.some((slotCenter) => Math.abs(centerX(candidate) - slotCenter) <= globalWidth * 0.45)
          );
          const rowWidth = median(nearby.map((candidate) => candidate.width)) || globalWidth;
          const rowHeight = median(nearby.map((candidate) => candidate.height)) || globalHeight;
          const rowY = median(nearby.map(centerY)) || median([centerY(left), centerY(right)]);
          const scored = scoreRowFit(candidates, slotCenters, rowY, rowWidth, rowHeight);
          if (scored.matched.length < 4) {
            continue;
          }
          const normalizedCards = slotCenters.map((slotCenter) =>
            normalizeSlotRect(slotCenter, rowY, rowWidth, imageWidth, imageHeight)
          );
          const fit = {
            cards: normalizedCards,
            matchedSlots: scored.matched.length,
            score: scored.score,
            dimensionSpread: scored.dimensionSpread,
            spacingSpread: scored.spacingSpread
          };
          if (!best || fit.score > best.score) {
            best = fit;
          }
        }
      }
    }
  }

  return best;
}

export function classifyDetection(matchedSlots: number, score: number, dimensionSpread: number, spacingSpread: number) {
  if (matchedSlots >= 7 && score >= 650 && dimensionSpread < 0.45 && spacingSpread < 0.42) {
    return "high" as const;
  }
  if (matchedSlots >= 5 && score >= 450 && dimensionSpread < 0.75 && spacingSpread < 1.1) {
    return "medium" as const;
  }
  return "low" as const;
}

function findEdgeComponents(imageData: ImageData, imageWidth: number, imageHeight: number) {
  const data = imageData.data;
  const roiTop = Math.floor(imageHeight * 0.56);
  const roiBottom = Math.floor(imageHeight * 0.985);
  const width = imageWidth;
  const height = imageHeight;
  const edge = new Uint8Array(width * height);

  for (let y = roiTop; y < roiBottom - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const offset = (y * width + x) * 4;
      const gray = data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114;
      const rightOffset = (y * width + x + 1) * 4;
      const downOffset = ((y + 1) * width + x) * 4;
      const rightGray = data[rightOffset] * 0.299 + data[rightOffset + 1] * 0.587 + data[rightOffset + 2] * 0.114;
      const downGray = data[downOffset] * 0.299 + data[downOffset + 1] * 0.587 + data[downOffset + 2] * 0.114;
      const gradient = Math.abs(gray - rightGray) + Math.abs(gray - downGray);
      if (gradient > 34 || (gradient > 22 && gray > 72)) {
        edge[y * width + x] = 1;
      }
    }
  }

  const dilated = new Uint8Array(edge);
  for (let pass = 0; pass < 2; pass += 1) {
    const source = pass === 0 ? edge : dilated.slice();
    for (let y = roiTop + 1; y < roiBottom - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = y * width + x;
        if (source[index]) {
          continue;
        }
        if (
          source[index - 1] ||
          source[index + 1] ||
          source[index - width] ||
          source[index + width] ||
          source[index - width - 1] ||
          source[index - width + 1] ||
          source[index + width - 1] ||
          source[index + width + 1]
        ) {
          dilated[index] = 1;
        }
      }
    }
  }

  const visited = new Uint8Array(width * height);
  const components: Candidate[] = [];
  for (let y = roiTop; y < roiBottom; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x;
      if (!dilated[start] || visited[start]) {
        continue;
      }
      let head = 0;
      const queue = [start];
      visited[start] = 1;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let count = 0;
      while (head < queue.length) {
        const current = queue[head++];
        count += 1;
        const currentX = current % width;
        const currentY = Math.floor(current / width);
        minX = Math.min(minX, currentX);
        maxX = Math.max(maxX, currentX);
        minY = Math.min(minY, currentY);
        maxY = Math.max(maxY, currentY);
        const neighbors = [current - 1, current + 1, current - width, current + width];
        for (const next of neighbors) {
          if (next < 0 || next >= dilated.length || visited[next] || !dilated[next]) {
            continue;
          }
          const nextX = next % width;
          if (Math.abs(nextX - currentX) > 1) {
            continue;
          }
          visited[next] = 1;
          queue.push(next);
        }
      }
      components.push({
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
        area: count
      });
    }
  }

  return components;
}

export function detectMtgoHandFromImageData(imageData: ImageData, imageWidth: number, imageHeight: number): MtgoHandDetection {
  const rawCandidates = findEdgeComponents(imageData, imageWidth, imageHeight);
  const candidates = filterCardCandidates(rawCandidates, imageWidth, imageHeight);
  const fit = fitSevenCardRow(candidates, imageWidth, imageHeight);
  if (!fit) {
    return {
      cards: [],
      matchedSlots: 0,
      confidence: "low",
      score: 0,
      debugCandidates: candidates
    };
  }
  return {
    cards: fit.cards,
    matchedSlots: fit.matchedSlots,
    confidence: classifyDetection(fit.matchedSlots, fit.score, fit.dimensionSpread, fit.spacingSpread),
    score: Math.round(fit.score),
    debugCandidates: candidates
  };
}
