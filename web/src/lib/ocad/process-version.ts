import { compareOcadObjects } from "./diff";
import type { OcadDiffResult } from "./diff-types";
import { changeIndicesByKind, limitStoredChanges } from "./diff-storage";
import {
  buildDiffLayerPath,
  generateDiffLayerSvgs,
  generateDiffLayerSvgsFromIndices,
} from "./diff-layers";
import { parseOcadBuffer } from "./read";
import { buildPreviewSvgPath, generateAndStorePreviewSvg } from "./svg";
import { readStoredFile } from "@/lib/storage";
import { prisma } from "@/lib/prisma";

const TOLERANCE = Number(process.env.DIFF_SPATIAL_TOLERANCE_M ?? 2);

export async function parseMapVersion(versionId: string): Promise<void> {
  const version = await prisma.mapVersion.findUnique({ where: { id: versionId } });
  if (!version) return;

  if (version.parseStatus === "OK" && version.previewSvgPath) return;

  await prisma.mapVersion.update({
    where: { id: versionId },
    data: { parseStatus: "PROCESSING", parseError: null },
  });

  try {
    const buffer = await readStoredFile(version.storagePath);
    const summary = await parseOcadBuffer(buffer, version.originalFilename);

    // Markera parsning klar innan SVG — om SVG OOM:ar/timeout:ar ska status inte sitta kvar i PROCESSING.
    await prisma.mapVersion.update({
      where: { id: versionId },
      data: {
        parseStatus: "OK",
        objectCount: summary.objectCount,
        parseError: null,
      },
    });

    let previewSvgPath = version.previewSvgPath;
    if (!previewSvgPath) {
      previewSvgPath = buildPreviewSvgPath(version.mapFileId, version.versionNumber);
      try {
        await generateAndStorePreviewSvg(buffer, previewSvgPath);
        await prisma.mapVersion.update({
          where: { id: versionId },
          data: { previewSvgPath },
        });
      } catch (svgErr) {
        console.error("SVG-generering misslyckades:", svgErr);
        await prisma.mapVersion.update({
          where: { id: versionId },
          data: {
            parseError:
              "Kartbilden kunde inte skapas automatiskt. Öppna kartan så den genereras vid visning.",
          },
        });
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Parsning misslyckades";
    await prisma.mapVersion.update({
      where: { id: versionId },
      data: {
        parseStatus: "ERROR",
        parseError: message,
      },
    });
    throw err;
  }
}

export async function computeVersionDiff(
  mapFileId: string,
  versionAId: string,
  versionBId: string,
): Promise<OcadDiffResult> {
  const [versionA, versionB] = await Promise.all([
    prisma.mapVersion.findUnique({ where: { id: versionAId } }),
    prisma.mapVersion.findUnique({ where: { id: versionBId } }),
  ]);

  if (!versionA || !versionB) {
    throw new Error("Version hittades inte");
  }

  if (versionA.versionNumber >= versionB.versionNumber) {
    throw new Error("versionA måste vara äldre än versionB");
  }

  await Promise.all([parseMapVersion(versionAId), parseMapVersion(versionBId)]);

  const [freshA, freshB] = await Promise.all([
    prisma.mapVersion.findUnique({ where: { id: versionAId } }),
    prisma.mapVersion.findUnique({ where: { id: versionBId } }),
  ]);

  if (freshA?.parseStatus === "ERROR" || freshB?.parseStatus === "ERROR") {
    throw new Error("Parsning misslyckades för en av versionerna");
  }

  const [bufferA, bufferB] = await Promise.all([
    readStoredFile(versionA.storagePath),
    readStoredFile(versionB.storagePath),
  ]);

  const [summaryA, summaryB] = await Promise.all([
    parseOcadBuffer(bufferA, versionA.originalFilename),
    parseOcadBuffer(bufferB, versionB.originalFilename),
  ]);

  const diff = compareOcadObjects(
    summaryA.objects,
    summaryB.objects,
    {
      fileNameA: versionA.originalFilename,
      fileNameB: versionB.originalFilename,
    },
    { toleranceMeters: TOLERANCE },
  );

  const layerObjectIndices = changeIndicesByKind(diff.changes);
  const stored = limitStoredChanges(diff.changes);

  let layerPaths = null;
  try {
    layerPaths = await generateDiffLayerSvgs(bufferA, bufferB, diff.changes, {
      added: buildDiffLayerPath(mapFileId, versionAId, versionBId, "added"),
      removed: buildDiffLayerPath(mapFileId, versionAId, versionBId, "removed"),
      modified: buildDiffLayerPath(mapFileId, versionAId, versionBId, "modified"),
    });
  } catch (layerErr) {
    console.error("Diff-lager SVG misslyckades:", layerErr);
  }

  const summaryJson = JSON.stringify({
    coordSpace: "ocad-native",
    added: diff.added,
    removed: diff.removed,
    modified: diff.modified,
    unchanged: diff.unchanged,
    durationMs: diff.durationMs,
    toleranceMeters: diff.toleranceMeters,
    totalChanges: stored.totalChanges,
    changesTruncated: stored.changesTruncated,
    maxChangesApplied: stored.maxChangesApplied,
    layerObjectIndices,
    bySymbol: diff.bySymbol,
    versionA: diff.versionA,
    versionB: diff.versionB,
    layerPaths: layerPaths
      ? {
          added: layerPaths.added,
          removed: layerPaths.removed,
          modified: layerPaths.modified,
          bounds: layerPaths.bounds,
        }
      : null,
  });

  const changesJson = JSON.stringify(stored.changes);

  await prisma.versionDiff.upsert({
    where: {
      versionAId_versionBId: { versionAId, versionBId },
    },
    create: {
      mapFileId,
      versionAId,
      versionBId,
      status: "OK",
      summaryJson,
      changesJson,
      computedAt: new Date(),
    },
    update: {
      status: "OK",
      summaryJson,
      changesJson,
      computedAt: new Date(),
    },
  });

  return {
    ...diff,
    changes: stored.changes,
    totalChanges: stored.totalChanges,
    changesTruncated: stored.changesTruncated,
    maxChangesApplied: stored.maxChangesApplied,
  };
}

export async function ensureDiffLayers(
  mapFileId: string,
  versionAId: string,
  versionBId: string,
  changes: import("./diff-types").OcadObjectChange[],
  existingSummary: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (existingSummary.layerPaths) return existingSummary;

  const [versionA, versionB] = await Promise.all([
    prisma.mapVersion.findUnique({ where: { id: versionAId } }),
    prisma.mapVersion.findUnique({ where: { id: versionBId } }),
  ]);

  if (!versionA || !versionB) return existingSummary;

  const [bufferA, bufferB] = await Promise.all([
    readStoredFile(versionA.storagePath),
    readStoredFile(versionB.storagePath),
  ]);

  const storedIndices = existingSummary.layerObjectIndices as
    | { added?: number[]; removed?: number[]; modified?: number[] }
    | undefined;

  const layerPaths = storedIndices
    ? await generateDiffLayerSvgsFromIndices(
        bufferA,
        bufferB,
        {
          added: new Set(storedIndices.added ?? []),
          removed: new Set(storedIndices.removed ?? []),
          modified: new Set(storedIndices.modified ?? []),
        },
        {
          added: buildDiffLayerPath(mapFileId, versionAId, versionBId, "added"),
          removed: buildDiffLayerPath(mapFileId, versionAId, versionBId, "removed"),
          modified: buildDiffLayerPath(mapFileId, versionAId, versionBId, "modified"),
        },
      )
    : await generateDiffLayerSvgs(bufferA, bufferB, changes, {
        added: buildDiffLayerPath(mapFileId, versionAId, versionBId, "added"),
        removed: buildDiffLayerPath(mapFileId, versionAId, versionBId, "removed"),
        modified: buildDiffLayerPath(mapFileId, versionAId, versionBId, "modified"),
      });

  const updatedSummary = {
    ...existingSummary,
    layerPaths: {
      added: layerPaths.added,
      removed: layerPaths.removed,
      modified: layerPaths.modified,
      bounds: layerPaths.bounds,
    },
  };

  await prisma.versionDiff.update({
    where: { versionAId_versionBId: { versionAId, versionBId } },
    data: { summaryJson: JSON.stringify(updatedSummary) },
  });

  return updatedSummary;
}

export async function processVersionAfterUpload(
  mapFileId: string,
  newVersionId: string,
  previousVersionId: string | null,
): Promise<void> {
  await parseMapVersion(newVersionId);

  if (previousVersionId) {
    await prisma.versionDiff.upsert({
      where: {
        versionAId_versionBId: {
          versionAId: previousVersionId,
          versionBId: newVersionId,
        },
      },
      create: {
        mapFileId,
        versionAId: previousVersionId,
        versionBId: newVersionId,
        status: "PROCESSING",
      },
      update: { status: "PROCESSING" },
    });

    try {
      await computeVersionDiff(mapFileId, previousVersionId, newVersionId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Diff misslyckades";
      await prisma.versionDiff.update({
        where: {
          versionAId_versionBId: {
            versionAId: previousVersionId,
            versionBId: newVersionId,
          },
        },
        data: { status: "ERROR", summaryJson: JSON.stringify({ error: message }) },
      });
      console.error("Diff failed:", err);
    }
  }
}
