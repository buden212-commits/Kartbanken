/**
 * Verifierar subset-diff scope, identisk checkin, och add/remove/move-detektering.
 * Kör: npm run test:subset-diff
 */
import { compareOcadObjects } from "../src/lib/ocad/diff";
import type { NormalizedOcadObject } from "../src/lib/ocad/types";
import { normalizeFromGeoJson } from "../src/lib/ocad/normalize";
import {
  buildCheckinDuplicateValidationWarnings,
  findExactDuplicateGroups,
} from "../src/lib/ocad/exact-duplicates";
import {
  buffersContentEqual,
  filterObjectsByIds,
  objectIdsFromParsed,
  objectMultisetsEqual,
  resolveCheckoutDiffScopeIds,
} from "../src/lib/checkout/subset-diff-helpers";
import type { Feature, Geometry } from "geojson";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function makeObject(
  objectIndex: number,
  symbolNumber: number,
  geometryHash: string,
  centroid: [number, number] = [100, 200],
): NormalizedOcadObject {
  return {
    objectIndex,
    symbolNumber,
    symbolName: `Symbol ${symbolNumber}`,
    type: "point",
    centroid,
    bbox: [centroid[0], centroid[1], centroid[0], centroid[1]],
    geometryHash,
  };
}

function makeLineObject(
  objectIndex: number,
  symbolNumber: number,
  geometryHash: string,
  vertices: [number, number][],
): NormalizedOcadObject {
  const xs = vertices.map((v) => v[0]);
  const ys = vertices.map((v) => v[1]);
  const centroid: [number, number] = [
    xs.reduce((sum, x) => sum + x, 0) / xs.length,
    ys.reduce((sum, y) => sum + y, 0) / ys.length,
  ];
  return {
    objectIndex,
    symbolNumber,
    symbolName: `Symbol ${symbolNumber}`,
    type: "line",
    centroid,
    bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
    geometryHash,
    vertices,
  };
}

const headObjects: NormalizedOcadObject[] = [
  makeObject(1, 101, "hash-a", [100, 200]),
  makeObject(2, 101, "hash-b", [150, 200]),
  makeObject(3, 102, "hash-c", [200, 200]),
  makeObject(99, 103, "hash-outside", [900, 900]),
];

const exportObjects: NormalizedOcadObject[] = [
  makeObject(1, 101, "hash-a", [100, 200]),
  makeObject(2, 101, "hash-b", [150, 200]),
];

const checkinSameAsExport: NormalizedOcadObject[] = [...exportObjects];

const selectionIds = new Set(["1", "2", "3", "99"]);
const exportIds = objectIdsFromParsed(exportObjects);
const checkinIds = objectIdsFromParsed(checkinSameAsExport);

const diffScope = resolveCheckoutDiffScopeIds(selectionIds, exportIds, checkinIds);
assert(diffScope.size === 2, "diff scope should follow export object ids");
assert(diffScope.has("1") && diffScope.has("2"), "export ids should be in diff scope");
assert(!diffScope.has("3"), "selection-only ids must not expand diff scope");

const headScoped = filterObjectsByIds(headObjects, diffScope);
assert(headScoped.length === 2, "head should be filtered to export scope");

assert(
  objectMultisetsEqual(headScoped, checkinSameAsExport),
  "same-file checkin should have identical object multiset",
);

const diff = compareOcadObjects(
  headScoped,
  checkinSameAsExport,
  { fileNameA: "head.ocd", fileNameB: "checkin.ocd" },
  { toleranceMeters: 2 },
);

assert(diff.added === 0 && diff.removed === 0 && diff.modified === 0, "scoped same objects → zero diff");

const oldHeadScoped = filterObjectsByIds(headObjects, selectionIds);
const brokenDiff = compareOcadObjects(
  oldHeadScoped,
  checkinSameAsExport,
  { fileNameA: "head.ocd", fileNameB: "checkin.ocd" },
  { toleranceMeters: 2 },
);
assert(
  brokenDiff.added > 0 || brokenDiff.removed > 0,
  "unscoped head vs checkin should produce false positives",
);

assert(buffersContentEqual(Buffer.from("abc"), Buffer.from("abc")), "byte equality expected");
assert(!buffersContentEqual(Buffer.from("abc"), Buffer.from("abd")), "byte inequality expected");

// --- add / remove / move against export baseline ---
const checkinEdited: NormalizedOcadObject[] = [
  makeObject(1, 101, "hash-a-moved", [100.5, 200]), // moved slightly (within tolerance)
  // object 2 removed
  makeObject(500, 105, "hash-new", [300, 400]), // added (different symbol → cannot steal match)
];

const editDiff = compareOcadObjects(
  exportObjects,
  checkinEdited,
  { fileNameA: "export.ocd", fileNameB: "checkin.ocd" },
  { toleranceMeters: 2 },
);

assert(editDiff.added === 1, `expected 1 added, got ${editDiff.added}`);
assert(editDiff.removed === 1, `expected 1 removed, got ${editDiff.removed}`);
assert(editDiff.modified === 0, `slight move within tolerance should be unchanged, got modified=${editDiff.modified}`);
assert(
  editDiff.changes.some((c) => c.changeType === "added" && c.objectIndex === 500),
  "new object index 500 must appear as added",
);
assert(
  editDiff.changes.some((c) => c.changeType === "removed" && c.objectIndex === 2),
  "removed object index 2 must appear as removed",
);
assert(
  !editDiff.changes.some((c) => c.changeType === "modified" && c.objectIndex === 1),
  "object index 1 within tolerance must not appear as modified",
);

// Index matching after geometry: far move with same objectIndex must count as modified, not remove+add
const farMoveDiff = compareOcadObjects(
  [makeObject(14630, 112000, "hash-old", [23775, -56296])],
  [makeObject(14630, 112000, "hash-new-pos", [23897, -56317])],
  { fileNameA: "export.ocd", fileNameB: "checkin.ocd" },
  { toleranceMeters: 2, matchByObjectIndex: true },
);
assert(farMoveDiff.modified === 1, `index-after-geometry far move expected modified, got ${farMoveDiff.modified}`);
assert(farMoveDiff.added === 0 && farMoveDiff.removed === 0, "index-after-geometry far move must not be remove+add");

// Geometry before index: remapped objectIndex with identical geometry must stay unchanged
const remappedExport = [
  makeObject(5, 101, "hash-tree", [100, 200]),
  makeObject(6, 102, "hash-path", [300, 400]),
];
const remappedCheckin = [
  makeObject(6, 101, "hash-tree", [100, 200]), // same tree, new index
  makeObject(5, 102, "hash-path", [300, 400]), // same path, swapped index
];
const remappedDiff = compareOcadObjects(
  remappedExport,
  remappedCheckin,
  { fileNameA: "export.ocd", fileNameB: "checkin.ocd" },
  { toleranceMeters: 2, matchByObjectIndex: true },
);
assert(
  remappedDiff.added === 0 && remappedDiff.removed === 0 && remappedDiff.modified === 0,
  `geometry-first remapped indices must be unchanged, got add=${remappedDiff.added} rem=${remappedDiff.removed} mod=${remappedDiff.modified}`,
);

// Remapped index reused by a different object while the original geometry lives under a new index
const remapConflictExport = [
  makeObject(5, 101, "hash-a", [100, 200]),
  makeObject(10, 101, "hash-b", [500, 600]),
];
const remapConflictCheckin = [
  makeObject(5, 101, "hash-b", [500, 600]), // index 5 now holds former object 10
  makeObject(99, 101, "hash-a", [100, 200]), // former object 5 under new index
];
const remapConflictDiff = compareOcadObjects(
  remapConflictExport,
  remapConflictCheckin,
  { fileNameA: "export.ocd", fileNameB: "checkin.ocd" },
  { toleranceMeters: 2, matchByObjectIndex: true },
);
assert(
  remapConflictDiff.added === 0 &&
    remapConflictDiff.removed === 0 &&
    remapConflictDiff.modified === 0,
  `geometry-first must pair by hash despite conflicting indices, got add=${remapConflictDiff.added} rem=${remapConflictDiff.removed} mod=${remapConflictDiff.modified}`,
);

// Hausdorff: små vertex-justeringar på linjer räknas som oförändrade inom tolerans
const lineA = makeLineObject(10, 501, "line-h1", [
  [100, 200],
  [200, 200],
]);
const lineB = makeLineObject(10, 501, "line-h2", [
  [100, 201],
  [200, 201],
]);
const lineNearDiff = compareOcadObjects(
  [lineA],
  [lineB],
  { fileNameA: "a.ocd", fileNameB: "b.ocd" },
  { toleranceMeters: 2 },
);
assert(lineNearDiff.modified === 0, "line within Hausdorff tolerance should be unchanged");

const lineFar = makeLineObject(10, 501, "line-h3", [
  [100, 210],
  [200, 210],
]);
const lineFarDiff = compareOcadObjects(
  [lineA],
  [lineFar],
  { fileNameA: "a.ocd", fileNameB: "b.ocd" },
  { toleranceMeters: 2 },
);
assert(lineFarDiff.modified === 1, "line beyond Hausdorff tolerance should be modified");

// Swap detection: korsvis identiska positioner men bytt innehåll
const swapA = [
  makeObject(1, 601, "swap-h1", [100, 200]),
  makeObject(2, 601, "swap-h2", [150, 200]),
];
const swapB = [
  makeObject(1, 601, "swap-h2", [100, 200]),
  makeObject(2, 601, "swap-h1", [150, 200]),
];
const swapDiff = compareOcadObjects(
  swapA,
  swapB,
  { fileNameA: "a.ocd", fileNameB: "b.ocd" },
  { toleranceMeters: 2 },
);
assert(swapDiff.modified === 2, `swapped pair should count as 2 modified, got ${swapDiff.modified}`);
assert(swapDiff.added === 0 && swapDiff.removed === 0, "swapped pair must not be remove+add");

assert(
  !objectIdsFromParsed([makeObject(-1, 0, "fake"), makeObject(1, 101, "hash-a")]).has("-1"),
  "negative objectIndex must not enter scope ids",
);

// Decorative symbol-element features must be ignored by normalize
const mixedFeatures = [
  {
    type: "Feature",
    properties: { sym: 101000, objectIndex: 7 },
    geometry: { type: "Point", coordinates: [1, 2] },
  },
  {
    type: "Feature",
    properties: { element: "101000-element-0", parentId: 1 },
    geometry: { type: "Point", coordinates: [1.1, 2.1] },
  },
] as Feature<Geometry, { sym: number; objectIndex: number; text?: string }>[];

const normalized = normalizeFromGeoJson(mixedFeatures, new Map([[101000, "Stig"]]));
assert(normalized.length === 1, "symbol-element features must be skipped");
assert(normalized[0]?.objectIndex === 7, "only real object should remain");

// Exact duplicate validation
const dupObjects = [
  makeObject(1, 101, "hash-dup", [100, 200]),
  makeObject(2, 101, "hash-dup", [100, 200]),
  makeObject(3, 102, "hash-other", [300, 400]),
];
const dupGroups = findExactDuplicateGroups(dupObjects);
assert(dupGroups.length === 1, "expected one duplicate group");
assert(dupGroups[0]?.count === 2, "duplicate group should have count 2");
assert(dupGroups[0]?.objectIndices.join(",") === "1,2", "duplicate indices should be 1,2");

const baselineForValidation = [makeObject(1, 101, "hash-dup", [100, 200])];
const checkinWithExtraCopy = [
  makeObject(1, 101, "hash-dup", [100, 200]),
  makeObject(50, 101, "hash-dup", [100, 200]),
];
const addedCopyDiff = compareOcadObjects(
  baselineForValidation,
  checkinWithExtraCopy,
  { fileNameA: "export.ocd", fileNameB: "checkin.ocd" },
  { toleranceMeters: 2 },
);
assert(addedCopyDiff.added === 1, "extra identical object should be added");
const validationWarnings = buildCheckinDuplicateValidationWarnings(
  checkinWithExtraCopy,
  baselineForValidation,
  addedCopyDiff.changes.filter((c) => c.changeType === "added"),
);
assert(
  validationWarnings.some((w) => w.includes("dubblett")),
  `expected internal duplicate warning, got: ${validationWarnings.join(" | ")}`,
);
assert(
  validationWarnings.some((w) => w.includes("exakta kopior")),
  `expected added-copy warning, got: ${validationWarnings.join(" | ")}`,
);

console.log("subset diff tests passed");
