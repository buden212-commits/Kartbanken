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
import {
  parseVersionDiffProgress,
  VERSION_DIFF_STALE_MS,
  versionDiffStepLabel,
  type VersionDiffProgress,
} from "./version-diff-progress";
import { readStoredFile } from "@/lib/storage";
import { prisma } from "@/lib/prisma";

export {
  parseVersionDiffProgress,
  VERSION_DIFF_STALE_MS,
  versionDiffStepLabel,
  type VersionDiffProgress,
  type VersionDiffProgressStep,
} from "./version-diff-progress";

const TOLERANCE = Number(process.env.DIFF_SPATIAL_TOLERANCE_M ?? 2);

async function writeVersionDiffProgress(
  mapFileId: string,
  versionAId: string,
  versionBId: string,
  progress: Omit<VersionDiffProgress, "updatedAt" | "label"> & {
    label?: string;
    updatedAt?: string;
  },
): Promise<void> {
  const payload: VersionDiffProgress = {
    step: progress.step,
    detail: progress.detail,
    startedAt: progress.startedAt,
    label: progress.label || versionDiffStepLabel(progress.step),
    updatedAt: progress.updatedAt ?? new Date().toISOString(),
  };
  await prisma.versionDiff.upsert({
    where: { versionAId_versionBId: { versionAId, versionBId } },
    create: {
      mapFileId,
      versionAId,
      versionBId,
      status: "PROCESSING",
      summaryJson: JSON.stringify({ progress: payload }),
    },
    update: {
      status: "PROCESSING",
      summaryJson: JSON.stringify({ progress: payload }),
    },
  });
}

/**
 * Startar jämförelse i bakgrunden högst en gång. Undviker att varje poll
 * startar om tung parsning (OOM-dödsspiral på stora kartor).
 */
export async function scheduleVersionCompare(
  mapFileId: string,
  versionAId: string,
  versionBId: string,
  options?: { force?: boolean },
): Promise<{ started: boolean; progress: VersionDiffProgress | null; stale: boolean }> {
  const existing = await prisma.versionDiff.findUnique({
    where: { versionAId_versionBId: { versionAId, versionBId } },
  });

  if (existing?.status === "OK" && !options?.force) {
    return { started: false, progress: null, stale: false };
  }

  const progress = parseVersionDiffProgress(existing?.summaryJson);
  const anchor = progress?.updatedAt
    ? new Date(progress.updatedAt).getTime()
    : (existing?.createdAt.getTime() ?? 0);
  const ageMs = anchor > 0 ? Date.now() - anchor : Number.POSITIVE_INFINITY;
  const stale = existing?.status === "PROCESSING" && ageMs >= VERSION_DIFF_STALE_MS;

  if (existing?.status === "PROCESSING" && !stale && !options?.force) {
    return { started: false, progress, stale: false };
  }

  const startedAt = new Date().toISOString();
  const initial: VersionDiffProgress = {
    step: "queued",
    label: versionDiffStepLabel("queued"),
    detail: stale
      ? "Föregående försök verkade ha fastnat — startar om."
      : "Startar jämförelse…",
    updatedAt: startedAt,
    startedAt,
  };

  await prisma.versionDiff.upsert({
    where: { versionAId_versionBId: { versionAId, versionBId } },
    create: {
      mapFileId,
      versionAId,
      versionBId,
      status: "PROCESSING",
      summaryJson: JSON.stringify({ progress: initial }),
    },
    update: {
      status: "PROCESSING",
      summaryJson: JSON.stringify({ progress: initial }),
      changesJson: null,
      computedAt: null,
    },
  });

  return { started: true, progress: initial, stale };
}

export async function parseMapVersion(versionId: string): Promise<void> {
  const version = await prisma.mapVersion.findUnique({ where: { id: versionId } });
  if (!version) return;

  // Redan parsad: försök bara skapa saknad kartbild, utan att sätta PROCESSING igen.
  if (version.parseStatus === "OK") {
    if (version.previewSvgPath) return;
    try {
      const buffer = await readStoredFile(version.storagePath);
      const previewSvgPath = buildPreviewSvgPath(version.mapFileId, version.versionNumber);
      await generateAndStorePreviewSvg(buffer, previewSvgPath);
      await prisma.mapVersion.update({
        where: { id: versionId },
        data: { previewSvgPath, parseError: null },
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
    return;
  }

  await prisma.mapVersion.update({
    where: { id: versionId },
    data: { parseStatus: "PROCESSING", parseError: null },
  });

  try {
    const buffer = await readStoredFile(version.storagePath);
    const summary = await parseOcadBuffer(buffer, version.originalFilename);

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
  const startedAt = new Date().toISOString();

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

  await writeVersionDiffProgress(mapFileId, versionAId, versionBId, {
    step: "parse_versions",
    detail: `v${versionA.versionNumber} och v${versionB.versionNumber}`,
    startedAt,
  });

  await Promise.all([parseMapVersion(versionAId), parseMapVersion(versionBId)]);

  const [freshA, freshB] = await Promise.all([
    prisma.mapVersion.findUnique({ where: { id: versionAId } }),
    prisma.mapVersion.findUnique({ where: { id: versionBId } }),
  ]);

  if (freshA?.parseStatus === "ERROR" || freshB?.parseStatus === "ERROR") {
    throw new Error(
      freshA?.parseError || freshB?.parseError || "Parsning misslyckades för en av versionerna",
    );
  }

  await writeVersionDiffProgress(mapFileId, versionAId, versionBId, {
    step: "load_files",
    detail: `${Math.round(versionA.fileSizeBytes / 1_000_000)} MB + ${Math.round(versionB.fileSizeBytes / 1_000_000)} MB`,
    startedAt,
  });

  const [bufferA, bufferB] = await Promise.all([
    readStoredFile(versionA.storagePath),
    readStoredFile(versionB.storagePath),
  ]);

  await writeVersionDiffProgress(mapFileId, versionAId, versionBId, {
    step: "parse_objects",
    detail: "Detta kan ta flera minuter på stora kartor.",
    startedAt,
  });

  const [summaryA, summaryB] = await Promise.all([
    parseOcadBuffer(bufferA, versionA.originalFilename),
    parseOcadBuffer(bufferB, versionB.originalFilename),
  ]);

  await writeVersionDiffProgress(mapFileId, versionAId, versionBId, {
    step: "compute_diff",
    detail: `${summaryA.objectCount.toLocaleString("sv-SE")} → ${summaryB.objectCount.toLocaleString("sv-SE")} objekt`,
    startedAt,
  });

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

  await writeVersionDiffProgress(mapFileId, versionAId, versionBId, {
    step: "save",
    detail: `${stored.totalChanges.toLocaleString("sv-SE")} ändringar`,
    startedAt,
  });

  // Markera OK innan lagergenerering — annars kan stora lager låsa sidan i PROCESSING.
  const summaryBase = {
    coordSpace: "ocad-native" as const,
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
    layerPaths: null as null | {
      added: string;
      removed: string;
      modified: string;
      bounds: { minX: number; minY: number; maxX: number; maxY: number };
    },
  };

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
      summaryJson: JSON.stringify(summaryBase),
      changesJson,
      computedAt: new Date(),
    },
    update: {
      status: "OK",
      summaryJson: JSON.stringify(summaryBase),
      changesJson,
      computedAt: new Date(),
    },
  });

  let layerPaths = null;
  try {
    layerPaths = await generateDiffLayerSvgs(bufferA, bufferB, stored.changes, {
      added: buildDiffLayerPath(mapFileId, versionAId, versionBId, "added"),
      removed: buildDiffLayerPath(mapFileId, versionAId, versionBId, "removed"),
      modified: buildDiffLayerPath(mapFileId, versionAId, versionBId, "modified"),
    });
  } catch (layerErr) {
    console.error("Diff-lager SVG misslyckades:", layerErr);
  }

  if (layerPaths) {
    await prisma.versionDiff.update({
      where: { versionAId_versionBId: { versionAId, versionBId } },
      data: {
        status: "OK",
        summaryJson: JSON.stringify({
          ...summaryBase,
          layerPaths: {
            added: layerPaths.added,
            removed: layerPaths.removed,
            modified: layerPaths.modified,
            bounds: layerPaths.bounds,
          },
        }),
        computedAt: new Date(),
      },
    });
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
        summaryJson: JSON.stringify({
          progress: {
            step: "queued",
            label: versionDiffStepLabel("queued"),
            updatedAt: new Date().toISOString(),
            startedAt: new Date().toISOString(),
          },
        }),
      },
      update: {
        // Starta bara om om den inte redan körs nyligen — undvik race från compare-poll.
        status: "PROCESSING",
      },
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
        data: {
          status: "ERROR",
          summaryJson: JSON.stringify({
            error: message,
            progress: {
              step: "compute_diff",
              label: "Misslyckades",
              detail: message,
              updatedAt: new Date().toISOString(),
            },
          }),
        },
      });
      console.error("Diff failed:", err);
    }
  }
}
