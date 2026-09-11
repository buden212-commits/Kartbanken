/**
 * Verifierar symbolmatchning, polygon-utbredning, kantobjekt och att korsande/klippta objekt filtreras.
 * Kör: npm run test:import-partial
 */
import {
  analyzeImportPartial,
  bboxFromObjects,
  checkoutGeometryFromAnalysis,
  isLikelyClipped,
  objectCrossesBbox,
  padBbox,
} from "../src/lib/checkout/import-partial-analysis";
import {
  buildImportPolygonFromObjects,
  buildImportPolygonWithMeta,
  buildGridContourFromObjects,
  concaveHull,
  convexHull,
  filterObjectsIntersectingPolygon,
  IMPORT_EDGE_BUFFER_METERS,
  isLikelyClippedByPolygon,
  objectCrossesPolygon,
  objectInEdgeBufferZone,
  objectIntersectsPolygon,
} from "../src/lib/checkout/import-partial-polygon";
import { pointInPolygon } from "../src/lib/checkout/overlap";
import {
  CheckoutSelectionType,
  parseSelectionJson,
  serializeSelection,
} from "../src/lib/checkout/types";
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

/** L-formad delkarta — AABB skulle täcka hörnet utan objekt. */
const lShapePartial: NormalizedOcadObject[] = [
  makeObject(1, 101, [0, 0, 10, 10]),
  makeObject(2, 101, [20, 0, 30, 10]),
  makeObject(3, 101, [40, 0, 50, 10]),
  makeObject(4, 101, [40, 20, 50, 30]),
  makeObject(5, 101, [40, 40, 50, 50]),
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
  assert(analysis.diff.removed === 0, "Objekt som korsar delkartans polygon ska inte räknas som borttagna");
  // Kantvarning är valfri: tight rutnätskontur kan utesluta överskridande objekt helt.
  if (analysis.warnings.length > 0) {
    assert(
      analysis.warnings.some((item) => item.includes("kant") || item.includes("hoppades") || item.includes("zon")),
      "Om varningar finns ska minst en handla om kant/skydd",
    );
  }
  assert(
    analysis.extent.minX <= 105 && analysis.extent.maxX >= 155,
    "Utbredning ska täcka delkartans objekt (kan vara utvidgad något av rutnätet)",
  );
  assert(analysis.ring.length >= 3, "Analys ska ha polygon-ring");
  assert(analysis.headObjectsInArea <= analysis.headObjectsTotal, "Objekt i området ≤ totalt");
  assert(
    analysis.edgeBufferMeters >= IMPORT_EDGE_BUFFER_METERS,
    "Kantbuffert minst 30 m (plus rutnätets förskjutning)",
  );
  assert(
    checkoutGeometryFromAnalysis(analysis).type === CheckoutSelectionType.POLYGON,
    "Checkout-geometri ska vara POLYGON",
  );
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
  assert(isLikelyClipped(clipped, extent!), "Linje som slutar vid randen ska flaggas som klippt (AABB)");
  const ring = buildImportPolygonFromObjects(clippedPartial);
  assert(ring != null && ring.length >= 3, "Klippt delkarta ska ge polygon");
  assert(
    isLikelyClippedByPolygon(clipped, ring!),
    "Linje som slutar vid polygonkanten ska flaggas som klippt",
  );
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
  assert(
    !analysis.diff.mapChanges.some(
      (change) => change.changeType === "added" && change.objectIndex === 10,
    ),
    "Klippt stubbe ska inte räknas som tillägg",
  );
}

{
  const empty = analyzeImportPartial({
    head,
    partial: makeSummary("empty.ocd", [], [101]),
  });
  assert(empty.blockers.some((item) => item.includes("inga kartobjekt")), "Tom delkarta ska blockera");
}

{
  const hull = convexHull([
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [5, 5],
  ]);
  assert(hull.length === 4, "Konvex hull ska droppa innre punkt");
}

{
  const ring = buildImportPolygonFromObjects(lShapePartial);
  assert(ring != null && ring.length >= 3, "L-form ska ge polygon");
  const cornerOutside = makeObject(50, 101, [5, 40, 15, 50]);
  assert(
    objectIntersectsPolygon(cornerOutside, ring!) === false,
    "Objekt i AABB-hörnet utanför L-formen ska inte ingå i polygon-scope",
  );
  const onStem = makeObject(51, 101, [42, 22, 48, 28]);
  assert(objectIntersectsPolygon(onStem, ring!), "Objekt på L-stammen ska ingå");
}

{
  // Diagonal cut: AABB would include the triangle's empty half.
  const diagonalPartial: NormalizedOcadObject[] = [
    makeObject(1, 101, [0, 0, 5, 5], { centroid: [2, 2] }),
    makeObject(2, 101, [10, 0, 15, 5], { centroid: [12, 2] }),
    makeObject(3, 101, [20, 0, 25, 5], { centroid: [22, 2] }),
    makeObject(4, 101, [0, 10, 5, 15], { centroid: [2, 12] }),
    makeObject(5, 101, [0, 20, 5, 25], { centroid: [2, 22] }),
  ];
  const ring = buildImportPolygonFromObjects(diagonalPartial)!;
  const headInCorner = makeObject(9, 101, [18, 18, 24, 24]);
  const crosses = makeObject(
    8,
    102,
    [0, 0, 30, 30],
    {
      type: "line",
      vertices: [
        [-5, 12],
        [30, 12],
      ],
    },
  );
  assert(objectCrossesPolygon(crosses, ring), "Linje genom polygon ska korsas");
  const analysis = analyzeImportPartial({
    head: makeSummary("head-diag.ocd", [...diagonalPartial, headInCorner, crosses], [101, 102], [
      -10, -10, 40, 40,
    ]),
    partial: makeSummary("partial-diag.ocd", diagonalPartial, [101]),
  });
  assert(
    !analysis.diff.mapChanges.some(
      (change) => change.changeType === "removed" && change.objectIndex === 9,
    ),
    "Objekt i AABB-hörnet utanför polygon ska inte räknas som borttaget",
  );
  assert(
    !analysis.diff.mapChanges.some(
      (change) => change.changeType === "removed" && change.objectIndex === 8,
    ),
    "Korsande linje ska skyddas från borttag",
  );
}

{
  const points: [number, number][] = [];
  for (let x = 0; x <= 40; x += 5) points.push([x, 0]);
  for (let y = 5; y <= 40; y += 5) points.push([40, y]);
  for (let x = 35; x >= 20; x -= 5) points.push([x, 40]);
  for (let y = 35; y >= 20; y -= 5) points.push([20, y]);
  for (let x = 15; x >= 0; x -= 5) points.push([x, 20]);
  for (let y = 15; y >= 5; y -= 5) points.push([0, y]);
  const concave = concaveHull(points, 3);
  assert(concave.length >= 3, "Concave hull ska returnera ring");
  const convex = convexHull(points);
  assert(concave.length >= convex.length, "Concave hull ska ha minst lika många hörn som konvex");
}

{
  // AABB-prefilter: fjärran objekt ska inte nå polygon-testet.
  const near = makeObject(1, 101, [100, 100, 110, 110]);
  const far = makeObject(2, 101, [9000, 9000, 9010, 9010]);
  const ring = buildImportPolygonFromObjects([near])!;
  const filtered = filterObjectsIntersectingPolygon([near, far], ring);
  assert(filtered.length === 1 && filtered[0]!.objectIndex === 1, "AABB ska sålla bort fjärran objekt");
}

{
  // Sten nära kanten ska skyddas från borttag (kantbuffert), trots att den saknas i delkartan.
  const areaPartial: NormalizedOcadObject[] = [];
  for (let x = 0; x <= 200; x += 20) {
    for (let y = 0; y <= 200; y += 20) {
      areaPartial.push(makeObject(1000 + x + y, 101, [x, y, x + 5, y + 5]));
    }
  }
  const ring = buildImportPolygonFromObjects(areaPartial)!;
  // Placera sten ~10 m innanför övre kanten.
  const stoneNearEdge = makeObject(42, 112, [100, 195, 102, 197], { type: "point", centroid: [101, 196] });
  assert(objectInEdgeBufferZone(stoneNearEdge, ring, IMPORT_EDGE_BUFFER_METERS), "Sten nära kant i buffertzon");
  const analysis = analyzeImportPartial({
    head: makeSummary("head-stone.ocd", [...areaPartial, stoneNearEdge], [101, 112], [-50, -50, 300, 300]),
    partial: makeSummary("partial-stone.ocd", areaPartial, [101]),
  });
  assert(
    !analysis.diff.mapChanges.some(
      (change) => change.changeType === "removed" && change.objectIndex === 42,
    ),
    "Sten i kantzon ska inte räknas som borttagen",
  );
  assert(analysis.headObjectsInArea >= areaPartial.length, "Head i området ska inkludera delkartans objekt");
}

{
  // C-form / vik: rutnät ska behålla inbuktningen (mittpunkten i viken ska vara utanför).
  const cShape: NormalizedOcadObject[] = [];
  let idx = 1;
  for (let x = 0; x <= 200; x += 20) {
    cShape.push(makeObject(idx++, 101, [x, 0, x + 8, 8]));
    cShape.push(makeObject(idx++, 101, [x, 200, x + 8, 208]));
  }
  for (let y = 20; y <= 180; y += 20) {
    cShape.push(makeObject(idx++, 101, [0, y, 8, y + 8]));
  }
  // Öppen sida till höger — ingen fyllning i mitten/viken.
  const ring = buildImportPolygonFromObjects(cShape)!;
  assert(ring.length >= 3, "C-form ska ge polygon");
  const bayPointInsideHullWouldCatch = pointInPolygon(150, 100, ring);
  assert(
    bayPointInsideHullWouldCatch === false,
    "Punkt i viken (öppen sida) ska ligga utanför rutnätskonturen",
  );
  const onArm = pointInPolygon(4, 100, ring);
  assert(onArm === true, "Punkt på C-armen ska ligga innanför konturen");
}

{
  const grid = buildGridContourFromObjects(
    [
      makeObject(1, 101, [0, 0, 10, 10]),
      makeObject(2, 101, [40, 0, 50, 10]),
      makeObject(3, 101, [40, 40, 50, 50]),
    ],
    { cellMeters: 10 },
  );
  assert(grid != null && grid.length >= 3, "buildGridContourFromObjects ska ge ring");
}

{
  // Rutnätskonturen ligger utanför datat — slacket måste rapporteras så kantzonen kan kompensera.
  const dense: NormalizedOcadObject[] = [];
  let idx = 1;
  for (let x = 0; x <= 200; x += 10) {
    for (let y = 0; y <= 200; y += 10) {
      dense.push(makeObject(idx++, 101, [x, y, x + 2, y + 2]));
    }
  }
  const meta = buildImportPolygonWithMeta(dense)!;
  assert(meta.ring.length >= 3, "buildImportPolygonWithMeta ska ge ring");
  assert(meta.edgeSlackMeters > 0, "Rutnätskontur ska rapportera förskjutning utåt");
}

{
  // Lång linje: tyngdpunkten ligger djupt inne, men änden når kanten.
  const areaPartial: NormalizedOcadObject[] = [];
  let idx = 2000;
  for (let x = 0; x <= 400; x += 20) {
    for (let y = 0; y <= 400; y += 20) {
      areaPartial.push(makeObject(idx++, 101, [x, y, x + 5, y + 5]));
    }
  }
  const ring = buildImportPolygonFromObjects(areaPartial)!;
  const stream = makeObject(9001, 305, [200, 150, 405, 155], {
    type: "line",
    centroid: [300, 152],
    vertices: [
      [200, 152],
      [300, 152],
      [404, 152],
    ],
  });
  assert(
    objectInEdgeBufferZone(stream, ring, IMPORT_EDGE_BUFFER_METERS),
    "Linje vars ände når kanten ska ligga i kantzonen även när tyngdpunkten är djupt inne",
  );
  const innerStone = makeObject(9002, 112, [198, 198, 200, 200], {
    type: "point",
    centroid: [199, 199],
  });
  assert(
    objectInEdgeBufferZone(innerStone, ring, IMPORT_EDGE_BUFFER_METERS) === false,
    "Objekt mitt i utsnittet ska inte ligga i kantzonen",
  );
  const analysis = analyzeImportPartial({
    head: makeSummary(
      "head-stream.ocd",
      [...areaPartial, stream],
      [101, 305],
      [-100, -100, 600, 600],
    ),
    partial: makeSummary("partial-stream.ocd", areaPartial, [101]),
  });
  assert(
    !analysis.diff.mapChanges.some(
      (change) => change.changeType === "removed" && change.objectIndex === 9001,
    ),
    "Linje som når kantzonen ska inte räknas som borttagen",
  );
}

{
  // Kantzonen ska följa med utcheckningen så incheckningen använder samma värde.
  const selection = {
    geometry: {
      type: CheckoutSelectionType.POLYGON,
      ring: [
        [0, 0],
        [100, 0],
        [100, 100],
      ] as [number, number][],
    },
    objectIds: [],
    importPartial: true,
    importRing: [
      [0, 0],
      [100, 0],
      [100, 100],
    ] as [number, number][],
    importEdgeBuffer: 75,
  };
  const parsed = parseSelectionJson(serializeSelection(selection));
  assert(parsed.importEdgeBuffer === 75, "importEdgeBuffer ska överleva serialisering");
}

console.log("test-import-partial-analysis: ok");
