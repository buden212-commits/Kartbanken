/**
 * Verifierar kluster-sortering av kartförslag.
 * Kör: npx tsx scripts/test-suggestion-density-sort.mts
 */
import {
  computeSuggestionClusterSizes,
  sortSuggestionsByClusterDensity,
  SUGGESTION_CLUSTER_RADIUS_M,
} from "../src/lib/suggestion/density-sort";
import type { SuggestionSummary } from "../src/lib/suggestion/types";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function makeSummary(id: string, createdAt: string): SuggestionSummary {
  return {
    id,
    status: "OPEN",
    category: "FEL_I_TERRANG",
    locationConfidence: "GANSKA_SAKER",
    title: null,
    comment: id,
    createdAt,
    updatedAt: createdAt,
    versionNumber: 1,
    mapVersionId: "v1",
    appliesToOlderVersion: false,
    hasAttachment: false,
    createdBy: { id: "u1", name: "Test", email: "t@example.com" },
    reviewedAt: null,
    reviewedBy: null,
    objectCount: 1,
  };
}

const centroids = new Map([
  ["a", { x: 0, y: 0 }],
  ["b", { x: 50, y: 0 }],
  ["c", { x: 500, y: 500 }],
]);

const sizes = computeSuggestionClusterSizes(["a", "b", "c"], centroids);
assert(sizes.get("a") === 2, "a och b ska klustras");
assert(sizes.get("b") === 2, "b ska dela kluster med a");
assert(sizes.get("c") === 1, "c ska vara ensam");

const far = new Map([
  ["x", { x: 0, y: 0 }],
  ["y", { x: SUGGESTION_CLUSTER_RADIUS_M + 10, y: 0 }],
]);
const farSizes = computeSuggestionClusterSizes(["x", "y"], far);
assert(farSizes.get("x") === 1 && farSizes.get("y") === 1, "För långt apart = separata kluster");

const suggestions = [
  makeSummary("c", "2026-01-01T00:00:00Z"),
  makeSummary("a", "2026-02-01T00:00:00Z"),
  makeSummary("b", "2026-03-01T00:00:00Z"),
];
const overlays = [
  { id: "a", status: "OPEN" as const, markingLabel: "1", geometry: { type: "Point" as const, coordinates: [0, 0] as [number, number] } },
  { id: "b", status: "OPEN" as const, markingLabel: "1", geometry: { type: "Point" as const, coordinates: [50, 0] as [number, number] } },
  { id: "c", status: "OPEN" as const, markingLabel: "1", geometry: { type: "Point" as const, coordinates: [500, 500] as [number, number] } },
];

const { items, clusterById } = sortSuggestionsByClusterDensity(suggestions, overlays);
assert(items[0]?.id === "a" || items[0]?.id === "b", "Kluster med 2 ska överst");
assert(items[2]?.id === "c", "Ensamt förslag sist");
assert((clusterById.get("a")?.clusterSize ?? 0) === 2, "Klusterstorlek 2");

console.log("suggestion-density-sort: ok");
