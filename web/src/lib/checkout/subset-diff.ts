import { parseSelectionJson, CheckoutSelectionType, type PolygonRing } from "./types";
import { bboxFromGeometry } from "./overlap";
import {
  isLikelyClippedByPolygon,
  objectCrossesPolygon,
  objectIntersectsPolygon,
} from "./import-partial-polygon";
import { objectCrossesBbox, objectIntersectsBbox } from "./import-partial-analysis";
import { compareOcadObjects } from "@/lib/ocad/diff";
import type { OcadDiffResult, OcadObjectChange, SymbolDiffSummary } from "@/lib/ocad/diff-types";
import {
  buildCheckoutDiffLayerPath,
  generateDiffLayerSvgs,
  type DiffLayerPaths,
} from "@/lib/ocad/diff-layers";
import { parseOcadBuffer } from "@/lib/ocad/read";
import type { NormalizedOcadObject } from "@/lib/ocad/types";
import { readStoredFile } from "@/lib/storage";
import { prisma } from "@/lib/prisma";
import {
  buffersContentEqual,
  buildEmptyOcadDiffResult,
  filterObjectsByIds,
  objectIdsFromParsed,
  objectMultisetsEqual,
  resolveCheckoutDiffScopeIds,
} from "./subset-diff-helpers";

const TOLERANCE = Number(process.env.DIFF_SPATIAL_TOLERANCE_M ?? 2);

export type CheckoutSubsetDiffResult = OcadDiffResult & {
  headVersionId: string;
  baseVersionId: string;
  headChangedSinceCheckout: boolean;
  scopedObjectIds: string[];
  outOfScopeWarnings: string[];
  layerPaths: DiffLayerPaths | null;
};

function buildSymbolSummariesFromChanges(changes: OcadObjectChange[]): SymbolDiffSummary[] {
  const map = new Map<number, SymbolDiffSummary>();

  for (const change of changes) {
    const current = map.get(change.symbolNumber) ?? {
      symbolNumber: change.symbolNumber,
      symbolName: change.symbolName,
      added: 0,
      removed: 0,
      modified: 0,
    };
    current[change.changeType] += 1;
    map.set(change.symbolNumber, current);
  }

  return [...map.values()].sort(
    (a, b) => b.added + b.removed + b.modified - (a.added + a.removed + a.modified),
  );
}

function filterChangesToScope(
  changes: OcadObjectChange[],
  diffScopeIds: Set<string>,
  selectionObjectIds: Set<string>,
): { changes: OcadObjectChange[]; outOfScopeWarnings: string[] } {
  const warnings: string[] = [];
  const filtered: OcadObjectChange[] = [];

  for (const change of changes) {
    const id = String(change.objectIndex);

    if (change.changeType === "added") {
      filtered.push(change);
      continue;
    }

    if (diffScopeIds.has(id) || selectionObjectIds.has(id)) {
      filtered.push(change);
      continue;
    }

    warnings.push(
      `Ändring på objekt ${id} (${change.symbolName}) ligger utanför ursprungligt utcheckningsurval.`,
    );
  }

  return { changes: filtered, outOfScopeWarnings: warnings };
}

function buildEmptyCheckoutSubsetDiff(input: {
  headVersionId: string;
  baseVersionId: string;
  headChangedSinceCheckout: boolean;
  scopedObjectIds: string[];
  fileNameA: string;
  fileNameB: string;
  objectCountA: number;
  objectCountB: number;
}): CheckoutSubsetDiffResult {
  return {
    ...buildEmptyOcadDiffResult(
      {
        fileNameA: input.fileNameA,
        fileNameB: input.fileNameB,
        objectCountA: input.objectCountA,
        objectCountB: input.objectCountB,
      },
      TOLERANCE,
    ),
    headVersionId: input.headVersionId,
    baseVersionId: input.baseVersionId,
    headChangedSinceCheckout: input.headChangedSinceCheckout,
    scopedObjectIds: input.scopedObjectIds,
    outOfScopeWarnings: [],
    layerPaths: null,
  };
}

export async function computeCheckoutSubsetDiff(checkoutId: string): Promise<CheckoutSubsetDiffResult> {
  const checkout = await prisma.mapCheckout.findUnique({
    where: { id: checkoutId },
    include: {
      baseVersion: true,
      mapFile: {
        include: {
          versions: {
            orderBy: { versionNumber: "desc" },
            take: 1,
          },
        },
      },
    },
  });

  if (!checkout) {
    throw new Error("Utcheckning hittades inte");
  }

  if (!checkout.checkinStoragePath) {
    throw new Error("Utcheckningen saknar incheckad fil");
  }

  const headVersion = checkout.mapFile.versions[0];
  if (!headVersion) {
    throw new Error("Kartfilen saknar aktuell version");
  }

  const selection = parseSelectionJson(checkout.selectionJson);
  const selectionObjectIds = new Set(selection.objectIds);
  const importPartial = selection.importPartial === true;

  const readTasks: Promise<Buffer>[] = [
    readStoredFile(headVersion.storagePath),
    readStoredFile(checkout.checkinStoragePath),
    readStoredFile(checkout.baseVersion.storagePath),
  ];
  if (checkout.exportStoragePath) {
    readTasks.push(readStoredFile(checkout.exportStoragePath));
  }

  const fileBuffers = await Promise.all(readTasks);
  const headBuffer = fileBuffers[0]!;
  const checkinBuffer = fileBuffers[1]!;
  const baseBuffer = fileBuffers[2]!;
  const exportBuffer = checkout.exportStoragePath ? fileBuffers[3] : undefined;

  const parseTasks: Promise<Awaited<ReturnType<typeof parseOcadBuffer>>>[] = [
    parseOcadBuffer(headBuffer, headVersion.originalFilename),
    parseOcadBuffer(checkinBuffer, "checkin.ocd"),
    parseOcadBuffer(baseBuffer, checkout.baseVersion.originalFilename),
  ];
  if (exportBuffer) {
    parseTasks.push(parseOcadBuffer(exportBuffer, "checkout-export.ocd"));
  }

  const parseResults = await Promise.all(parseTasks);
  const headSummary = parseResults[0]!;
  const checkinSummary = parseResults[1]!;
  const baseSummary = parseResults[2]!;
  const exportSummary = exportBuffer ? parseResults[3] : undefined;

  const checkinObjectIds = objectIdsFromParsed(checkinSummary.objects);
  const exportObjectIds = exportSummary ? objectIdsFromParsed(exportSummary.objects) : null;
  const diffScopeIds = resolveCheckoutDiffScopeIds(
    selectionObjectIds,
    exportObjectIds,
    checkinObjectIds,
  );
  const scopedObjectIds = [...diffScopeIds];

  const headChangedSinceCheckoutDetailed =
    checkout.baseVersionId !== headVersion.id ||
    baseSummary.objectCount !== headSummary.objectCount;

  // Baseline A = exported checkout file when available (exactly what the user edited).
  // Fall back to head objects filtered by scope ids.
  let baselineObjects = exportSummary
    ? exportSummary.objects
    : filterObjectsByIds(headSummary.objects, diffScopeIds);

  const importRing: PolygonRing | null =
    importPartial && selection.importRing && selection.importRing.length >= 3
      ? selection.importRing
      : importPartial && selection.geometry.type === CheckoutSelectionType.POLYGON
        ? selection.geometry.ring
        : null;
  const importExtent =
    selection.importExtent ?? (importPartial ? bboxFromGeometry(selection.geometry) : null);

  if (importPartial && importRing) {
    baselineObjects = baselineObjects.filter((object) =>
      objectIntersectsPolygon(object, importRing),
    );
  } else if (importPartial && importExtent) {
    baselineObjects = baselineObjects.filter((object) => objectIntersectsBbox(object, importExtent));
  }

  let checkinObjects: NormalizedOcadObject[] = checkinSummary.objects;
  const clippedCheckinIndices = new Set<number>();
  if (importPartial && importRing) {
    for (const object of checkinObjects) {
      if (isLikelyClippedByPolygon(object, importRing)) {
        clippedCheckinIndices.add(object.objectIndex);
      }
    }
    checkinObjects = checkinObjects.filter(
      (object) => !clippedCheckinIndices.has(object.objectIndex),
    );
  }

  const emptyDiffInput = {
    headVersionId: headVersion.id,
    baseVersionId: checkout.baseVersionId,
    headChangedSinceCheckout: headChangedSinceCheckoutDetailed,
    scopedObjectIds,
    fileNameA: exportSummary ? "checkout-export.ocd" : headVersion.originalFilename,
    fileNameB: "checkin-subset.ocd",
    objectCountA: baselineObjects.length,
    objectCountB: checkinObjects.length,
  };

  if (exportBuffer && buffersContentEqual(checkinBuffer, exportBuffer)) {
    return buildEmptyCheckoutSubsetDiff(emptyDiffInput);
  }

  if (exportSummary && objectMultisetsEqual(baselineObjects, checkinObjects)) {
    return buildEmptyCheckoutSubsetDiff(emptyDiffInput);
  }

  if (
    !exportSummary &&
    !headChangedSinceCheckoutDetailed &&
    objectMultisetsEqual(baselineObjects, checkinObjects)
  ) {
    return buildEmptyCheckoutSubsetDiff(emptyDiffInput);
  }

  const diff = compareOcadObjects(
    baselineObjects,
    checkinObjects,
    {
      fileNameA: emptyDiffInput.fileNameA,
      fileNameB: "checkin-subset.ocd",
    },
    { toleranceMeters: TOLERANCE, matchByObjectIndex: !importPartial },
  );

  // Guard against false add/remove from rematching noise when content bags match.
  if (
    diff.modified === 0 &&
    diff.added + diff.removed > 0 &&
    objectMultisetsEqual(baselineObjects, checkinObjects)
  ) {
    return buildEmptyCheckoutSubsetDiff(emptyDiffInput);
  }

  const { changes: scopedChanges, outOfScopeWarnings } = filterChangesToScope(
    diff.changes,
    diffScopeIds,
    selectionObjectIds,
  );

  let changes = scopedChanges;
  if (importPartial && (importRing || importExtent)) {
    const baselineByIndex = new Map(baselineObjects.map((object) => [object.objectIndex, object]));
    const kept: typeof scopedChanges = [];
    for (const change of scopedChanges) {
      if (change.changeType === "added") {
        if (clippedCheckinIndices.has(change.objectIndex)) {
          outOfScopeWarnings.push(
            `Klippt kantobjekt ${change.objectIndex} (${change.symbolName}) hoppades över — behandlas inte som tillägg.`,
          );
          continue;
        }
        kept.push(change);
        continue;
      }
      const baseline = baselineByIndex.get(change.objectIndex);
      const crosses = baseline
        ? importRing
          ? objectCrossesPolygon(baseline, importRing)
          : importExtent
            ? objectCrossesBbox(baseline, importExtent)
            : false
        : false;
      if (crosses) {
        outOfScopeWarnings.push(
          `Kantobjekt ${change.objectIndex} (${change.symbolName}) hoppades över — det går utanför importerat område.`,
        );
        continue;
      }
      kept.push(change);
    }
    changes = kept;
  }

  let layerPaths: DiffLayerPaths | null = null;
  if (changes.length > 0) {
    try {
      // Removed objects live in the baseline file (export or head); added/modified in checkin.
      const removedSourceBuffer = exportBuffer ?? headBuffer;
      layerPaths = await generateDiffLayerSvgs(removedSourceBuffer, checkinBuffer, changes, {
        added: buildCheckoutDiffLayerPath(checkout.mapFileId, checkoutId, "added"),
        removed: buildCheckoutDiffLayerPath(checkout.mapFileId, checkoutId, "removed"),
        modified: buildCheckoutDiffLayerPath(checkout.mapFileId, checkoutId, "modified"),
      });
    } catch (layerErr) {
      console.error("Checkout diff-lager misslyckades:", layerErr);
    }
  }

  return {
    ...diff,
    changes,
    added: changes.filter((change) => change.changeType === "added").length,
    removed: changes.filter((change) => change.changeType === "removed").length,
    modified: changes.filter((change) => change.changeType === "modified").length,
    bySymbol: buildSymbolSummariesFromChanges(changes),
    headVersionId: headVersion.id,
    baseVersionId: checkout.baseVersionId,
    headChangedSinceCheckout: headChangedSinceCheckoutDetailed,
    scopedObjectIds,
    outOfScopeWarnings,
    layerPaths,
  };
}

export async function storeCheckoutDiffSummary(
  checkoutId: string,
  diff: CheckoutSubsetDiffResult,
): Promise<void> {
  await prisma.mapCheckout.update({
    where: { id: checkoutId },
    data: {
      diffSummaryJson: JSON.stringify({
        added: diff.added,
        removed: diff.removed,
        modified: diff.modified,
        headVersionId: diff.headVersionId,
        baseVersionId: diff.baseVersionId,
        headChangedSinceCheckout: diff.headChangedSinceCheckout,
        scopedObjectIds: diff.scopedObjectIds,
        outOfScopeWarnings: diff.outOfScopeWarnings,
        bySymbol: diff.bySymbol,
        changes: diff.changes,
        layerPaths: diff.layerPaths,
        computedAt: new Date().toISOString(),
      }),
    },
  });
}
