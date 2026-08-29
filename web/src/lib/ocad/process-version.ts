import { compareOcadObjects } from "./diff";
import type { OcadDiffResult } from "./diff-types";
import { changeIndicesByKind, limitStoredChanges } from "./diff-storage";
import {
  buildDiffLayerPath,
  generateDiffLayerSvgs,
  generateDiffLayerSvgsFromIndices,
} from "./diff-layers";
import { parseOcadBuffer } from "./read";
import { extractOcadMapNotes } from "./ocad-map-notes";
import { buildPreviewSvgPath, generateAndStorePreviewSvg } from "./svg";
import {
  isVersionDiffProgressStale,
  parseVersionDiffProgress,
  VERSION_DIFF_HEARTBEAT_MS,
  VERSION_DIFF_STEPS,
  versionDiffStepIndex,
  versionDiffStepLabel,
  type VersionDiffProgress,
} from "./version-diff-progress";
import { readStoredFile } from "@/lib/storage";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";

export {
  isVersionDiffProgressStale,
  parseVersionDiffProgress,
  VERSION_DIFF_SOFT_STALE_MS,
  VERSION_DIFF_STALE_MS,
  VERSION_DIFF_STEPS,
  versionDiffStepIndex,
  versionDiffStepLabel,
  type VersionDiffProgress,
  type VersionDiffProgressStep,
} from "./version-diff-progress";

const TOLERANCE = Number(process.env.DIFF_SPATIAL_TOLERANCE_M ?? 2);
/** En 21 MB-fil från Blob ska normalt ta sekunder — inte minuter. */
const FILE_READ_TIMEOUT_MS = 90_000;

async function readStoredFileWithTimeout(
  storagePath: string,
  label: string,
): Promise<Buffer> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      readStoredFile(storagePath),
      new Promise<Buffer>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error(
              `Timeout vid hämtning av ${label} (${Math.round(FILE_READ_TIMEOUT_MS / 1000)} s). Försök igen.`,
            ),
          );
        }, FILE_READ_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function yieldEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

async function writeVersionDiffProgress(
  mapFileId: string,
  versionAId: string,
  versionBId: string,
  progress: Omit<VersionDiffProgress, "updatedAt" | "label"> & {
    label?: string;
    updatedAt?: string;
  },
  options?: { requireRunId?: string },
): Promise<boolean> {
  if (options?.requireRunId) {
    const existing = await prisma.versionDiff.findUnique({
      where: { versionAId_versionBId: { versionAId, versionBId } },
      select: { summaryJson: true, status: true },
    });
    if (existing?.status === "OK") return false;
    const current = parseVersionDiffProgress(existing?.summaryJson);
    if (current?.runId && current.runId !== options.requireRunId) {
      return false;
    }
  }

  const payload: VersionDiffProgress = {
    step: progress.step,
    detail: progress.detail,
    startedAt: progress.startedAt,
    runId: progress.runId,
    stepIndex: progress.stepIndex ?? versionDiffStepIndex(progress.step),
    stepCount: progress.stepCount ?? VERSION_DIFF_STEPS.length,
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
  return true;
}

function startProgressHeartbeat(
  mapFileId: string,
  versionAId: string,
  versionBId: string,
  getProgress: () => Omit<VersionDiffProgress, "updatedAt" | "label"> & {
    label?: string;
  },
  runId: string,
): () => void {
  const timer = setInterval(() => {
    const progress = getProgress();
    void writeVersionDiffProgress(
      mapFileId,
      versionAId,
      versionBId,
      { ...progress, runId },
      { requireRunId: runId },
    ).catch((err) => console.error("Version diff heartbeat failed:", err));
  }, VERSION_DIFF_HEARTBEAT_MS);
  return () => clearInterval(timer);
}

/**
 * Startar jämförelse i bakgrunden högst en gång. Undviker att varje poll
 * startar om tung parsning (OOM-dödsspiral på stora kartor). Startar om om
 * I/O-steg slutat hjärtklappa (after() dog) eller vid lång hard-stale.
 */
export async function scheduleVersionCompare(
  mapFileId: string,
  versionAId: string,
  versionBId: string,
  options?: { force?: boolean },
): Promise<{
  started: boolean;
  progress: VersionDiffProgress | null;
  stale: boolean;
  runId?: string;
}> {
  const existing = await prisma.versionDiff.findUnique({
    where: { versionAId_versionBId: { versionAId, versionBId } },
  });

  if (existing?.status === "OK" && !options?.force) {
    return { started: false, progress: null, stale: false };
  }

  const progress = parseVersionDiffProgress(existing?.summaryJson);
  const stale = isVersionDiffProgressStale(progress, existing?.status);

  if (
    (existing?.status === "PROCESSING" || existing?.status === "PENDING") &&
    !stale &&
    !options?.force
  ) {
    return { started: false, progress, stale: false };
  }

  const startedAt = new Date().toISOString();
  const runId = randomUUID();
  const initial: VersionDiffProgress = {
    step: "queued",
    label: versionDiffStepLabel("queued"),
    detail: stale
      ? "Föregående försök verkade ha fastnat (ingen statusuppdatering) — startar om."
      : "Startar jämförelse…",
    updatedAt: startedAt,
    startedAt,
    runId,
    stepIndex: 1,
    stepCount: VERSION_DIFF_STEPS.length,
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

  return { started: true, progress: initial, stale, runId };
}

export async function parseMapVersion(
  versionId: string,
  options?: { skipPreview?: boolean },
): Promise<void> {
  const version = await prisma.mapVersion.findUnique({ where: { id: versionId } });
  if (!version) return;

  if (version.parseStatus === "OK") {
    if (options?.skipPreview || version.previewSvgPath) {
      if (version.mapNotes === null) {
        try {
          const buffer = await readStoredFile(version.storagePath);
          await prisma.mapVersion.update({
            where: { id: versionId },
            data: { mapNotes: extractOcadMapNotes(buffer) },
          });
        } catch (err) {
          console.error("Kunde inte läsa kartinformation:", err);
        }
      }
      return;
    }
    try {
      const buffer = await readStoredFile(version.storagePath);
      const previewSvgPath = buildPreviewSvgPath(version.mapFileId, version.versionNumber);
      await generateAndStorePreviewSvg(buffer, previewSvgPath);
      await prisma.mapVersion.update({
        where: { id: versionId },
        data: {
          previewSvgPath,
          parseError: null,
          ...(version.mapNotes === null ? { mapNotes: extractOcadMapNotes(buffer) } : {}),
        },
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
        mapNotes: extractOcadMapNotes(buffer),
      },
    });

    if (options?.skipPreview) return;

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
  options?: { runId?: string },
): Promise<OcadDiffResult> {
  const startedAt = new Date().toISOString();
  const existingProgress = parseVersionDiffProgress(
    (
      await prisma.versionDiff.findUnique({
        where: { versionAId_versionBId: { versionAId, versionBId } },
        select: { summaryJson: true },
      })
    )?.summaryJson,
  );
  const runId = options?.runId ?? existingProgress?.runId ?? randomUUID();

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

  let currentStep: VersionDiffProgress["step"] = "parse_versions";
  let currentDetail = `v${versionA.versionNumber} och v${versionB.versionNumber} — säkerställer parsning (kartbild skapas separat)`;

  const stopHeartbeat = startProgressHeartbeat(
    mapFileId,
    versionAId,
    versionBId,
    () => ({
      step: currentStep,
      detail: currentDetail,
      startedAt,
      runId,
      stepIndex: versionDiffStepIndex(currentStep),
      stepCount: VERSION_DIFF_STEPS.length,
    }),
    runId,
  );

  try {
    const ok = await writeVersionDiffProgress(
      mapFileId,
      versionAId,
      versionBId,
      {
        step: "parse_versions",
        detail: currentDetail,
        startedAt,
        runId,
      },
      { requireRunId: runId },
    );
    if (!ok) {
      return {
        added: 0,
        removed: 0,
        modified: 0,
        unchanged: 0,
        durationMs: 0,
        toleranceMeters: TOLERANCE,
        changes: [],
        bySymbol: [],
        versionA: {
          fileName: versionA.originalFilename,
          objectCount: versionA.objectCount ?? 0,
        },
        versionB: {
          fileName: versionB.originalFilename,
          objectCount: versionB.objectCount ?? 0,
        },
        totalChanges: 0,
        changesTruncated: false,
        maxChangesApplied: 0,
      };
    }

    await Promise.all([
      parseMapVersion(versionAId, { skipPreview: true }),
      parseMapVersion(versionBId, { skipPreview: true }),
    ]);

    const [freshA, freshB] = await Promise.all([
      prisma.mapVersion.findUnique({ where: { id: versionAId } }),
      prisma.mapVersion.findUnique({ where: { id: versionBId } }),
    ]);

    if (freshA?.parseStatus === "ERROR" || freshB?.parseStatus === "ERROR") {
      throw new Error(
        freshA?.parseError || freshB?.parseError || "Parsning misslyckades för en av versionerna",
      );
    }

    currentStep = "parse_objects";
    const sizeA = Math.round(versionA.fileSizeBytes / 1_000_000);
    const sizeB = Math.round(versionB.fileSizeBytes / 1_000_000);
    currentDetail = `Hämtar v${versionA.versionNumber} (${sizeA} MB)…`;
    await writeVersionDiffProgress(
      mapFileId,
      versionAId,
      versionBId,
      { step: "parse_objects", detail: currentDetail, startedAt, runId },
      { requireRunId: runId },
    );

    const bufferA = await readStoredFileWithTimeout(
      versionA.storagePath,
      `v${versionA.versionNumber}`,
    );
    await yieldEventLoop();

    currentDetail = `Hämtar v${versionB.versionNumber} (${sizeB} MB)…`;
    await writeVersionDiffProgress(
      mapFileId,
      versionAId,
      versionBId,
      { step: "parse_objects", detail: currentDetail, startedAt, runId },
      { requireRunId: runId },
    );

    const bufferB = await readStoredFileWithTimeout(
      versionB.storagePath,
      `v${versionB.versionNumber}`,
    );
    await yieldEventLoop();

    const objectHint =
      freshA?.objectCount && freshB?.objectCount
        ? `Ca ${freshA.objectCount.toLocaleString("sv-SE")} + ${freshB.objectCount.toLocaleString("sv-SE")} objekt`
        : "Kartobjekten";

    currentDetail = `${objectHint} — parsar v${versionA.versionNumber} (kan ta flera minuter)…`;
    await writeVersionDiffProgress(
      mapFileId,
      versionAId,
      versionBId,
      { step: "parse_objects", detail: currentDetail, startedAt, runId },
      { requireRunId: runId },
    );
    await yieldEventLoop();

    const summaryA = await parseOcadBuffer(bufferA, versionA.originalFilename);
    await yieldEventLoop();

    currentDetail = `${objectHint} — parsar v${versionB.versionNumber} (kan ta flera minuter)…`;
    await writeVersionDiffProgress(
      mapFileId,
      versionAId,
      versionBId,
      { step: "parse_objects", detail: currentDetail, startedAt, runId },
      { requireRunId: runId },
    );
    await yieldEventLoop();

    const summaryB = await parseOcadBuffer(bufferB, versionB.originalFilename);
    await yieldEventLoop();

    currentStep = "compute_diff";
    currentDetail = `${summaryA.objectCount.toLocaleString("sv-SE")} → ${summaryB.objectCount.toLocaleString("sv-SE")} objekt`;
    await writeVersionDiffProgress(
      mapFileId,
      versionAId,
      versionBId,
      { step: "compute_diff", detail: currentDetail, startedAt, runId },
      { requireRunId: runId },
    );

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

    currentStep = "save";
    currentDetail = `${stored.totalChanges.toLocaleString("sv-SE")} ändringar`;
    await writeVersionDiffProgress(
      mapFileId,
      versionAId,
      versionBId,
      { step: "save", detail: currentDetail, startedAt, runId },
      { requireRunId: runId },
    );

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

    const latest = parseVersionDiffProgress(
      (
        await prisma.versionDiff.findUnique({
          where: { versionAId_versionBId: { versionAId, versionBId } },
          select: { summaryJson: true },
        })
      )?.summaryJson,
    );
    if (latest?.runId && latest.runId !== runId) {
      return {
        ...diff,
        changes: stored.changes,
        totalChanges: stored.totalChanges,
        changesTruncated: stored.changesTruncated,
        maxChangesApplied: stored.maxChangesApplied,
      };
    }

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
  } finally {
    stopHeartbeat();
  }
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
    const scheduled = await scheduleVersionCompare(mapFileId, previousVersionId, newVersionId, {
      force: true,
    });
    try {
      await computeVersionDiff(mapFileId, previousVersionId, newVersionId, {
        runId: scheduled.runId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Diff misslyckades";
      const current = await prisma.versionDiff.findUnique({
        where: {
          versionAId_versionBId: {
            versionAId: previousVersionId,
            versionBId: newVersionId,
          },
        },
        select: { summaryJson: true, status: true },
      });
      if (current?.status !== "OK") {
        const currentProgress = parseVersionDiffProgress(current?.summaryJson);
        if (!scheduled.runId || !currentProgress?.runId || currentProgress.runId === scheduled.runId) {
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
                  runId: scheduled.runId,
                  startedAt: scheduled.progress?.startedAt,
                },
              }),
            },
          });
        }
      }
      console.error("Diff failed:", err);
    }
  }
}
