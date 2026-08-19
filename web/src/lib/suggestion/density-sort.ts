import { bboxFromSuggestionGeometry } from "@/lib/suggestion/geometry";
import type { SuggestionGeometry, SuggestionOverlayItem, SuggestionSummary } from "@/lib/suggestion/types";

/** Avstånd i kartmeter — förslag inom detta avstånd räknas som samma område. */
export const SUGGESTION_CLUSTER_RADIUS_M = 200;

export type SuggestionClusterInfo = {
  clusterSize: number;
  clusterRank: number;
};

type Centroid = { x: number; y: number };

function centroidFromGeometry(geometry: SuggestionGeometry): Centroid {
  switch (geometry.type) {
    case "Point":
      return { x: geometry.coordinates[0], y: geometry.coordinates[1] };
    case "Bbox": {
      const { minX, minY, maxX, maxY } = geometry.bbox;
      return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    }
    case "Polygon":
    case "LineString": {
      const bbox = bboxFromSuggestionGeometry(geometry);
      return { x: (bbox.minX + bbox.maxX) / 2, y: (bbox.minY + bbox.maxY) / 2 };
    }
  }
}

export function buildSuggestionCentroidsFromOverlays(
  overlays: SuggestionOverlayItem[],
): Map<string, Centroid> {
  const sums = new Map<string, { x: number; y: number; count: number }>();
  for (const item of overlays) {
    const c = centroidFromGeometry(item.geometry);
    const prev = sums.get(item.id);
    if (!prev) {
      sums.set(item.id, { x: c.x, y: c.y, count: 1 });
    } else {
      sums.set(item.id, {
        x: prev.x + c.x,
        y: prev.y + c.y,
        count: prev.count + 1,
      });
    }
  }
  const result = new Map<string, Centroid>();
  for (const [id, sum] of sums) {
    result.set(id, { x: sum.x / sum.count, y: sum.y / sum.count });
  }
  return result;
}

function distanceM(a: Centroid, b: Centroid): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

class UnionFind {
  private parent = new Map<string, string>();

  find(id: string): string {
    const parent = this.parent.get(id);
    if (!parent || parent === id) {
      this.parent.set(id, id);
      return id;
    }
    const root = this.find(parent);
    this.parent.set(id, root);
    return root;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent.set(rootB, rootA);
  }
}

export function computeSuggestionClusterSizes(
  suggestionIds: string[],
  centroids: Map<string, Centroid>,
  radiusM = SUGGESTION_CLUSTER_RADIUS_M,
): Map<string, number> {
  const ids = suggestionIds.filter((id) => centroids.has(id));
  const uf = new UnionFind();
  for (const id of ids) uf.find(id);

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i]!;
      const b = ids[j]!;
      const ca = centroids.get(a)!;
      const cb = centroids.get(b)!;
      if (distanceM(ca, cb) <= radiusM) uf.union(a, b);
    }
  }

  const componentCounts = new Map<string, number>();
  for (const id of ids) {
    const root = uf.find(id);
    componentCounts.set(root, (componentCounts.get(root) ?? 0) + 1);
  }

  const sizes = new Map<string, number>();
  for (const id of ids) {
    sizes.set(id, componentCounts.get(uf.find(id)) ?? 1);
  }
  for (const id of suggestionIds) {
    if (!sizes.has(id)) sizes.set(id, 1);
  }
  return sizes;
}

export function sortSuggestionsByClusterDensity<T extends SuggestionSummary>(
  suggestions: T[],
  overlays: SuggestionOverlayItem[],
): { items: T[]; clusterById: Map<string, SuggestionClusterInfo> } {
  if (suggestions.length <= 1) {
    const clusterById = new Map<string, SuggestionClusterInfo>();
    for (const s of suggestions) {
      clusterById.set(s.id, { clusterSize: 1, clusterRank: 1 });
    }
    return { items: [...suggestions], clusterById };
  }

  const centroids = buildSuggestionCentroidsFromOverlays(overlays);
  const clusterSizes = computeSuggestionClusterSizes(
    suggestions.map((s) => s.id),
    centroids,
  );

  const sorted = [...suggestions].sort((a, b) => {
    const sizeA = clusterSizes.get(a.id) ?? 1;
    const sizeB = clusterSizes.get(b.id) ?? 1;
    if (sizeB !== sizeA) return sizeB - sizeA;
    const ageA = new Date(a.createdAt).getTime();
    const ageB = new Date(b.createdAt).getTime();
    if (ageA !== ageB) return ageA - ageB;
    return a.id.localeCompare(b.id);
  });

  const clusterById = new Map<string, SuggestionClusterInfo>();
  let lastSize: number | null = null;
  let rank = 0;
  for (const item of sorted) {
    const clusterSize = clusterSizes.get(item.id) ?? 1;
    if (clusterSize !== lastSize) {
      rank += 1;
      lastSize = clusterSize;
    }
    clusterById.set(item.id, { clusterSize, clusterRank: rank });
  }

  return { items: sorted, clusterById };
}
