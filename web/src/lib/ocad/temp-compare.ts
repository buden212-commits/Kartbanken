import { compareOcadObjects } from "./diff";
import type { OcadObjectChange } from "./diff-types";
import { buildTempDiffLayerPath, generateDiffLayerSvgs } from "./diff-layers";
import { parseOcadBuffer } from "./read";
import { generateAndStorePreviewSvg } from "./svg";
import {
  fileExists,
  readStoredFile,
  uploadFile,
} from "@/lib/storage";
import { randomUUID } from "crypto";

const TOLERANCE = Number(process.env.DIFF_SPATIAL_TOLERANCE_M ?? 2);
const MAX_STORED_CHANGES = 5000;

/** Skip re-start om ett bakgrundsanrop redan kör (serverless kan ta flera minuter). */
const PROCESSING_LEASE_MS = 2 * 60 * 1000;
/** Efter detta markeras jobbet som misslyckat om det fortfarande är processing. */
export const TEMP_COMPARE_STALE_MS = 15 * 60 * 1000;

export type TempCompareLayerPaths = {
  added: string;
  removed: string;
  modified: string;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
};

export type TempCompareSummary = {
  coordSpace: "ocad-native";
  added: number;
  removed: number;
  modified: number;
  unchanged: number;
  durationMs: number;
  toleranceMeters: number;
  bySymbol: import("./diff-types").SymbolDiffSummary[];
  versionA: { fileName: string; objectCount: number };
  versionB: { fileName: string; objectCount: number };
  layerPaths: TempCompareLayerPaths | null;
};

export type TempCompareJob = {
  id: string;
  userId: string;
  createdAt: string;
  status: "processing" | "ok" | "error";
  processingStartedAt?: string;
  error?: string;
  fileNameA: string;
  fileNameB: string;
  summary?: TempCompareSummary;
  changes?: OcadObjectChange[];
};

function metaPath(jobId: string): string {
  return `temp-compare/${jobId}/meta.json`;
}

function filePathA(jobId: string): string {
  return `temp-compare/${jobId}/a.ocd`;
}

function filePathB(jobId: string): string {
  return `temp-compare/${jobId}/b.ocd`;
}

function previewPath(jobId: string): string {
  return `temp-compare/${jobId}/preview.svg`;
}

export async function readTempCompareJob(jobId: string): Promise<TempCompareJob | null> {
  try {
    const raw = await readStoredFile(metaPath(jobId));
    return JSON.parse(raw.toString("utf-8")) as TempCompareJob;
  } catch {
    return null;
  }
}

async function writeTempCompareJob(job: TempCompareJob): Promise<void> {
  await uploadFile(metaPath(job.id), Buffer.from(JSON.stringify(job), "utf-8"));
}

export async function createTempCompareJob(
  userId: string,
  bufferA: Buffer,
  bufferB: Buffer,
  fileNameA: string,
  fileNameB: string,
): Promise<string> {
  const jobId = randomUUID();
  await uploadFile(filePathA(jobId), bufferA);
  await uploadFile(filePathB(jobId), bufferB);

  const job: TempCompareJob = {
    id: jobId,
    userId,
    createdAt: new Date().toISOString(),
    status: "processing",
    fileNameA,
    fileNameB,
  };
  await writeTempCompareJob(job);
  return jobId;
}

export async function initTempCompareJob(
  userId: string,
  fileNameA: string,
  fileNameB: string,
): Promise<{ jobId: string; pathA: string; pathB: string }> {
  const jobId = randomUUID();

  const job: TempCompareJob = {
    id: jobId,
    userId,
    createdAt: new Date().toISOString(),
    status: "processing",
    fileNameA,
    fileNameB,
  };
  await writeTempCompareJob(job);

  return {
    jobId,
    pathA: filePathA(jobId),
    pathB: filePathB(jobId),
  };
}

export async function completeTempCompareJob(
  jobId: string,
  userId: string,
): Promise<TempCompareJob> {
  const job = await readTempCompareJob(jobId);
  if (!job) {
    throw new Error("Jobb hittades inte");
  }
  if (job.userId !== userId) {
    throw new Error("Otillåten åtkomst till jobbet");
  }

  const [existsA, existsB] = await Promise.all([
    fileExists(filePathA(jobId)),
    fileExists(filePathB(jobId)),
  ]);

  if (!existsA || !existsB) {
    throw new Error("En eller båda filerna saknas i lagringen");
  }

  return job;
}

export function isTempCompareJobStale(job: TempCompareJob): boolean {
  const startedAt = job.processingStartedAt ?? job.createdAt;
  return Date.now() - new Date(startedAt).getTime() > TEMP_COMPARE_STALE_MS;
}

/** Markera utgånget jobb som fel — anropas vid polling innan svar skickas. */
export async function failStaleTempCompareJob(job: TempCompareJob): Promise<TempCompareJob> {
  const failed: TempCompareJob = {
    ...job,
    status: "error",
    error:
      "Jämförelsen tog för lång tid. Försök igen — om problemet kvarstår kan filerna vara för stora eller skadade.",
  };
  await writeTempCompareJob(failed);
  return failed;
}

export async function processTempCompareJob(jobId: string): Promise<void> {
  const job = await readTempCompareJob(jobId);
  if (!job || job.status !== "processing") return;

  if (isTempCompareJobStale(job)) {
    await failStaleTempCompareJob(job);
    return;
  }

  if (job.processingStartedAt) {
    const leaseAge = Date.now() - new Date(job.processingStartedAt).getTime();
    if (leaseAge < PROCESSING_LEASE_MS) return;
  }

  await writeTempCompareJob({
    ...job,
    processingStartedAt: new Date().toISOString(),
  });

  const activeJob = (await readTempCompareJob(jobId)) ?? job;

  try {
    const [bufferA, bufferB] = await Promise.all([
      readStoredFile(filePathA(jobId)),
      readStoredFile(filePathB(jobId)),
    ]);

    const [summaryA, summaryB] = await Promise.all([
      parseOcadBuffer(bufferA, activeJob.fileNameA),
      parseOcadBuffer(bufferB, activeJob.fileNameB),
    ]);

    const diff = compareOcadObjects(
      summaryA.objects,
      summaryB.objects,
      {
        fileNameA: activeJob.fileNameA,
        fileNameB: activeJob.fileNameB,
      },
      { toleranceMeters: TOLERANCE, maxChanges: MAX_STORED_CHANGES },
    );

    await generateAndStorePreviewSvg(bufferB, previewPath(jobId));

    let layerPaths: TempCompareLayerPaths | null = null;
    try {
      const generated = await generateDiffLayerSvgs(bufferA, bufferB, diff.changes, {
        added: buildTempDiffLayerPath(jobId, "added"),
        removed: buildTempDiffLayerPath(jobId, "removed"),
        modified: buildTempDiffLayerPath(jobId, "modified"),
      });
      layerPaths = {
        added: generated.added,
        removed: generated.removed,
        modified: generated.modified,
        bounds: generated.bounds,
      };
    } catch (layerErr) {
      console.error("Temp diff-lager misslyckades:", layerErr);
    }

    const updated: TempCompareJob = {
      ...activeJob,
      status: "ok",
      summary: {
        coordSpace: "ocad-native",
        added: diff.added,
        removed: diff.removed,
        modified: diff.modified,
        unchanged: diff.unchanged,
        durationMs: diff.durationMs,
        toleranceMeters: diff.toleranceMeters,
        bySymbol: diff.bySymbol,
        versionA: diff.versionA,
        versionB: diff.versionB,
        layerPaths,
      },
      changes: diff.changes,
    };
    await writeTempCompareJob(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Jämförelse misslyckades";
    await writeTempCompareJob({
      ...activeJob,
      status: "error",
      error: message,
    });
  }
}

export function getTempComparePreviewPath(jobId: string): string {
  return previewPath(jobId);
}
