/**
 * Verifierar symbolmatchning, utbredning, kantobjekt och att korsande objekt inte raderas.
 * Kör: npm run test:import-partial
 */
import {
  analyzeImportPartial,
  bboxFromObjects,
  isLikelyClipped,
  objectCrossesBbox,
  padBbox,
} from "../src/lib/checkout/import-partial-analysis";
import type { NormalizedOcadObject, OcadParseSummary } from "../src/lib/ocad/types";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function makeObject(
  objectIndex: number,
  symbolNumber: number,
  bbox: [number, number, number, number],
  extra?: Partial<NormalizedOcadObject>,
): NormalizedOcadObject {
  const centroid: [number, number] = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
  return {
    objectIndex,
    symbolNumber,
    symbolName: `Symbol ${symbolNumber}`,
    type: extra?.type ?? "point",
    centroid,
    bbox,
    geometryHash: `hash-${objectIndex}`,
    ...extra,
  };
}

function makeSummary(
  fileName: string,
  objects: NormalizedOcadObject[],
  symbolNums: number[],
  bounds?: [number, number, number, number],
): OcadParseSummary {
  return {
    fileName,
    fileSizeBytes: 1,
    parseDurationMs: 0,
    ocadVersion: 12,
    objectCount: objects.length,
    symbolCount: symbolNums.length,
    symbolNums,
    warnings: [],
    byType: { point: objects.length, line: 0, area: 0, text: 0, unknown: 0 },
    topSymbols: [],
    bounds: bounds ?? null,
    objects,
  };
}

const headObjects: NormalizedOcadObject[] = [
  makeObject(1, 101, [100, 100, 110, 110]),
  makeObject(2, 101, [150, 100, 160, 110]),
  makeObject(3, 102, [50, 100, 400, 120], { type: "line" }),
  makeObject(99, 103, [900, 900, 910, 910]),
];

const matchingPartial: NormalizedOcadObject[] = [
  makeObject(1, 101, [100, 100, 110, 110]),
  makeObject(2, 101, [150, 100, 160, 110]),
];

const unknownSymbolPartial: NormalizedOcadObject[] = [
  makeObject(1, 101, [100, 100, 110, 110]),
  makeObject(8, 999, [120, 100, 130, 110]),
];

const clippedPartial: NormalizedOcadObject[] = [
  makeObject(1, 101, [100, 100, 110, 110]),
  makeObject(10, 102, [100, 100, 200, 200], {
    type: "line",
    vertices: [
      [100, 150],
      [200, 150],
      [200, 100],
    ],
  }),
];

const head = makeSummary("head.ocd", headObjects, [101, 102, 103], [0, 0, 1000, 1000]);

{
  const analysis = analyzeImportPartial({
    head,
    partial: makeSummary("partial.ocd", matchingPartial, [101, 102]),
  });
  assert(analysis.blockers.length === 0, "Matchande symboler ska inte blockera");
  assert(analysis.symbols.onlyInPartial.length === 0, "Inga okända symboler");
  assert(analysis.symbols.matched.some((row) => row.number === 101), "Symbol 101 ska matcha");
  assert(analysis.diff.removed === 0, "Objekt som korsar delkartans ram ska inte räknas som borttagna");
  assert(
    analysis.warnings.some((item) => item.includes("kantöverskridande")),
    "Varning om hoppade kantobjekt",
  );
  assert(analysis.extent.minX === 100 && analysis.extent.maxX === 160, "Utbredning från delkartans objekt");
  assert(analysis.boundary.type === "BBOX", "Defaultgräns är AABB");
  assert(analysis.riskZoneMeters === 40, "Riskzon 40 m");
}

{
  const analysis = analyzeImportPartial({
    head,
    partial: makeSummary("bad.ocd", unknownSymbolPartial, [101, 999]),
  });
  assert(analysis.blockers.length > 0, "Okänd symbol ska blockera");
  assert(analysis.symbols.onlyInPartial.some((row) => row.number === 999), "Symbol 999 bara i delkarta");
}

{
  const analysis = analyzeImportPartial({
    head,
    partial: makeSummary("far.ocd", [makeObject(1, 101, [5000, 5000, 5010, 5010])], [101]),
  });
  assert(
    analysis.blockers.some((item) => item.includes("utanför")),
    "Utbredning utanför stora kartan ska blockera",
  );
}

{
  const extent = bboxFromObjects(clippedPartial);
  assert(extent != null, "clippedPartial har utbredning");
  const clipped = clippedPartial[1]!;
  assert(isLikelyClipped(clipped, extent!), "Linje som slutar vid randen ska flaggas som klippt");
}

{
  const longLine = makeObject(3, 102, [200, 100, 400, 120], { type: "line" });
  const extent = { minX: 100, minY: 100, maxX: 160, maxY: 110 };
  assert(objectCrossesBbox(longLine, extent) === false, "Linjen ligger utanför extent");
  const crossing = makeObject(3, 102, [50, 100, 400, 120], { type: "line" });
  assert(objectCrossesBbox(crossing, extent), "Linje som går över extent ska korsas");
}

{
  const padded = padBbox({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, 0.01, 100);
  assert(padded.minX === -100 && padded.maxX === 110, "padBbox ska använda minPad 100");
}

{
  const analysis = analyzeImportPartial({
    head,
    partial: makeSummary("clip.ocd", clippedPartial, [101, 102]),
  });
  assert(analysis.likelyClippedCount >= 1, "Klippt linje ska räknas");
  assert(analysis.blockers.length === 0, "Kända symboler i klippt fil ska inte blockera");
}

{
  const empty = analyzeImportPartial({
    head,
    partial: makeSummary("empty.ocd", [], [101]),
  });
  assert(empty.blockers.some((item) => item.includes("inga kartobjekt")), "Tom delkarta ska blockera");
}

{
  // Punkt nära kanten i grundkartan saknas i delkartan → riskzon, inte auto-radering.
  const bigHead = makeSummary(
    "head-edge.ocd",
    [
      makeObject(1, 101, [200, 200, 200, 200]), // inner (safe)
      makeObject(2, 101, [105, 200, 105, 200]), // near left edge
      makeObject(3, 102, [50, 100, 400, 120], { type: "line" }), // crosses
    ],
    [101, 102],
    [0, 0, 1000, 1000],
  );
  const partial = makeSummary(
    "partial-edge.ocd",
    [
      makeObject(1, 101, [200, 200, 200, 200]),
      makeObject(10, 101, [100, 100, 100, 100]),
      makeObject(11, 101, [300, 300, 300, 300]),
    ],
    [101],
  );
  const analysis = analyzeImportPartial({ head: bigHead, partial });
  assert(analysis.extent.minX === 100 && analysis.extent.maxX === 300, "Extent 100–300");
  assert(
    analysis.riskRemovals.some((item) => item.objectIndex === 2),
    "Kantpunkt ska ligga i riskRemovals",
  );
  assert(
    !analysis.diff.mapChanges.some(
      (change) => change.changeType === "removed" && change.objectIndex === 2,
    ),
    "Kantpunkt ska inte auto-räknas som borttagen",
  );
  assert(
    !analysis.diff.mapChanges.some(
      (change) => change.changeType === "removed" && change.objectIndex === 3,
    ),
    "Korsande linje ska inte auto-raderas",
  );
}

console.log("test-import-partial-analysis: ok");
