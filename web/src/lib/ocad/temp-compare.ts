import { compareOcadObjects } from "./diff";
import type { OcadObjectChange } from "./diff-types";
import { buildTempDiffLayerPath, generateDiffLayerSvgs } from "./diff-layers";
import { parseOcadBuffer } from "./read";
import { generateAndStorePreviewSvg } from "./svg";
import { readStoredFile, uploadFile } from "@/lib/storage";
import { randomUUID } from "crypto";

const TOLERANCE = Number(process.env.DIFF_SPATIAL_TOLERANCE_M ?? 2);
const MAX_STORED_CHANGES = 5000;

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

export async function processTempCompareJob(jobId: string): Promise<void> {
  const job = await readTempCompareJob(jobId);
  if (!job || job.status !== "processing") return;

  try {
    const [bufferA, bufferB] = await Promise.all([
      readStoredFile(filePathA(jobId)),
      readStoredFile(filePathB(jobId)),
    ]);

    const [summaryA, summaryB] = await Promise.all([
      parseOcadBuffer(bufferA, job.fileNameA),
      parseOcadBuffer(bufferB, job.fileNameB),
    ]);

    const diff = compareOcadObjects(
      summaryA.objects,
      summaryB.objects,
      {
        fileNameA: job.fileNameA,
        fileNameB: job.fileNameB,
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
      ...job,
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
      ...job,
      status: "error",
      error: message,
    });
  }
}

export function getTempComparePreviewPath(jobId: string): string {
  return previewPath(jobId);
}
