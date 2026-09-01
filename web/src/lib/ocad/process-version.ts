import { compareOcadObjects } from "./diff";
import type { OcadDiffResult } from "./diff-types";
import { changeIndicesByKind, limitStoredChanges } from "./diff-storage";
import {
  buildDiffLayerPath,
  generateDiffLayerSvgs,
  generateDiffLayerSvgsFromIndices,
} from "./diff-layers";
import { parseOcadBuffer } from "./read";
import type { OcadParseSummary } from "./types";
import { buildPreviewSvgPath, generateAndStorePreviewSvg } from "./svg";
import { readStoredFile } from "@/lib/storage";
import { prisma } from "@/lib/prisma";

const TOLERANCE = Number(process.env.DIFF_SPATIAL_TOLERANCE_M ?? 2);

type VersionRecord = {
  id: string;
  mapFileId: string;
  versionNumber: number;
  previewSvgPath: string | null;
};

/** Spara parsresultat och skapa förhandsvisning bara när den saknas. */
async function persistParsedVersion(
  version: VersionRecord,
  buffer: Buffer,
  summary: OcadParseSummary,
): Promise<void> {
  let previewSvgPath = version.previewSvgPath;
  if (!previewSvgPath) {
    previewSvgPath = buildPreviewSvgPath(version.mapFileId, version.versionNumber);
    try {
      await generateAndStorePreviewSvg(buffer, previewSvgPath);
    } catch (svgErr) {
      console.error("SVG-generering misslyckades:", svgErr);
      previewSvgPath = null;
    }
  }

  await prisma.mapVersion.update({
    where: { id: version.id },
    data: {
      parseStatus: "OK",
      objectCount: summary.objectCount,
      parseError: null,
      previewSvgPath,
    },
  });
}

async function markVersionParseError(versionId: string, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : "Parsning misslyckades";
  await prisma.mapVersion.update({
    where: { id: versionId },
    data: {
      parseStatus: "ERROR",
      parseError: message,
    },
  });
}

export async function parseMapVersion(versionId: string): Promise<void> {
  const version = await prisma.mapVersion.findUnique({ where: { id: versionId } });
  if (!version) return;

  if (version.parseStatus === "OK") return;

  await prisma.mapVersion.update({
    where: { id: versionId },
    data: { parseStatus: "PROCESSING" },
  });

  try {
    const buffer = await readStoredFile(version.storagePath);
    const summary = await parseOcadBuffer(buffer, version.originalFilename);
    await persistParsedVersion(version, buffer, summary);
  } catch (err) {
    await markVersionParseError(versionId, err);
    throw err;
  }
}

export type VersionDiffStage = "parse" | "diff" | "layers";

export async function computeVersionDiff(
  mapFileId: string,
  versionAId: string,
  versionBId: string,
  onStage?: (stage: VersionDiffStage) => Promise<void> | void,
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

  await onStage?.("parse");

  const [bufferA, bufferB] = await Promise.all([
    readStoredFile(versionA.storagePath),
    readStoredFile(versionB.storagePath),
  ]);

  // Parsa varje fil exakt en gång — tidigare parsades båda filerna två gånger
  // (en gång för versionsstatus och en gång för diffen), vilket dubblade tiden.
  let summaryA: OcadParseSummary;
  let summaryB: OcadParseSummary;
  try {
    summaryA = await parseOcadBuffer(bufferA, versionA.originalFilename);
  } catch (err) {
    await markVersionParseError(versionAId, err);
    throw err;
  }
  try {
    summaryB = await parseOcadBuffer(bufferB, versionB.originalFilename);
  } catch (err) {
    await markVersionParseError(versionBId, err);
    throw err;
  }

  await Promise.all([
    persistParsedVersion(versionA, bufferA, summaryA),
    persistParsedVersion(versionB, bufferB, summaryB),
  ]);

  await onStage?.("diff");

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

  const baseSummary = {
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
  };

  const changesJson = JSON.stringify(stored.changes);

  // Spara diffen som klar innan kartlagren renderas. Lagren är den tyngsta delen
  // och om körningen avbryts där ska diffen ändå finnas kvar i stället för att
  // fastna i PROCESSING.
  await prisma.versionDiff.upsert({
    where: {
      versionAId_versionBId: { versionAId, versionBId },
    },
    create: {
      mapFileId,
      versionAId,
      versionBId,
      status: "OK",
      summaryJson: JSON.stringify({ ...baseSummary, layerPaths: null }),
      changesJson,
      computedAt: new Date(),
    },
    update: {
      status: "OK",
      summaryJson: JSON.stringify({ ...baseSummary, layerPaths: null }),
      changesJson,
      computedAt: new Date(),
    },
  });

  await onStage?.("layers");

  try {
    const layerPaths = await generateDiffLayerSvgs(bufferA, bufferB, diff.changes, {
      added: buildDiffLayerPath(mapFileId, versionAId, versionBId, "added"),
      removed: buildDiffLayerPath(mapFileId, versionAId, versionBId, "removed"),
      modified: buildDiffLayerPath(mapFileId, versionAId, versionBId, "modified"),
    });

    await prisma.versionDiff.update({
      where: { versionAId_versionBId: { versionAId, versionBId } },
      data: {
        summaryJson: JSON.stringify({
          ...baseSummary,
          layerPaths: {
            added: layerPaths.added,
            removed: layerPaths.removed,
            modified: layerPaths.modified,
            bounds: layerPaths.bounds,
          },
        }),
      },
    });
  } catch (layerErr) {
    console.error("Diff-lager SVG misslyckades:", layerErr);
  }

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

  try {
    const { buildTilePyramidForVersion } = await import("./tile-generate");
    await buildTilePyramidForVersion(newVersionId);
  } catch (err) {
    console.error("Tile pyramid after upload failed:", newVersionId, err);
  }

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
