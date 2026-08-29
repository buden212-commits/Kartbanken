import { randomUUID } from "crypto";
import { logAction } from "@/lib/audit";
import { detectCheckoutConflicts } from "@/lib/checkout/overlap";
import { bboxFromGeometry } from "@/lib/checkout/overlap";
import {
  analyzeImportPartial,
  checkoutGeometryFromAnalysis,
  importExtentFromAnalysis,
  type ImportPartialAnalysis,
} from "@/lib/checkout/import-partial-analysis";
import { parseImportBoundary } from "@/lib/checkout/import-partial-boundary";
import { objectIdsFromSelection } from "@/lib/checkout/selection-objects";
import {
  createCheckout,
  findActiveOverlapCandidates,
  getHeadVersionId,
  updateCheckoutCheckin,
} from "@/lib/checkout/repository";
import { generateCheckoutExport } from "@/lib/checkout/create-checkout";
import { scheduleCheckoutSubsetDiff } from "@/lib/checkout/diff-status";
import {
  CheckoutSelectionType,
  CheckoutStatus,
  type CheckoutSelectionGeometry,
} from "@/lib/checkout/types";
import { readOcadHeaderVersion } from "@/lib/ocad/ocad-export-server";
import { normalizeSourceVersion } from "@/lib/ocad/ocad-export-shared";
import { parseOcadBuffer } from "@/lib/ocad/read";
import { generateAndStorePreviewSvg } from "@/lib/ocad/svg";
import { prisma } from "@/lib/prisma";
import {
  buildCheckoutCheckinPath,
  fileExists,
  readStoredFile,
  uploadFile,
} from "@/lib/storage";

export type ImportPartialJob = {
  id: string;
  userId: string;
  mapFileId: string;
  mapSlug: string;
  headVersionId: string;
  fileName: string;
  createdAt: string;
  status: "ok" | "error";
  error?: string;
  analysis?: ImportPartialAnalysis;
  /** Relative blob path for partial SVG preview when generated. */
  previewSvgPath?: string;
};

function metaPath(jobId: string): string {
  return `temp-import/${jobId}/meta.json`;
}

export function importPartialFilePath(jobId: string): string {
  return `temp-import/${jobId}/partial.ocd`;
}

export function importPartialPreviewPath(jobId: string): string {
  return `temp-import/${jobId}/preview.svg`;
}

async function writeJob(job: ImportPartialJob): Promise<void> {
  await uploadFile(metaPath(job.id), Buffer.from(JSON.stringify(job), "utf-8"));
}

export async function readImportPartialJob(jobId: string): Promise<ImportPartialJob | null> {
  try {
    const raw = await readStoredFile(metaPath(jobId));
    return JSON.parse(raw.toString("utf-8")) as ImportPartialJob;
  } catch {
    return null;
  }
}

async function analyzeAgainstHead(
  mapFileId: string,
  headVersionId: string,
  partialBuffer: Buffer,
  fileName: string,
  boundary?: CheckoutSelectionGeometry,
): Promise<ImportPartialAnalysis> {
  const headVersion = await prisma.mapVersion.findUnique({ where: { id: headVersionId } });
  if (!headVersion) {
    throw new Error("Aktuell kartversion hittades inte.");
  }

  const headBuffer = await readStoredFile(headVersion.storagePath);
  const [headSummary, partialSummary] = await Promise.all([
    parseOcadBuffer(headBuffer, headVersion.originalFilename),
    parseOcadBuffer(partialBuffer, fileName),
  ]);

  const analysis = analyzeImportPartial({
    head: headSummary,
    partial: partialSummary,
    boundary,
  });

  const geometry = checkoutGeometryFromAnalysis(analysis);
  const importExtent = importExtentFromAnalysis(analysis);
  const selection = {
    geometry,
    objectIds: objectIdsFromSelection(headSummary.objects, {
      type: CheckoutSelectionType.BBOX,
      bbox: importExtent,
    }),
    importPartial: true as const,
    importExtent,
    importBoundary: analysis.boundary,
  };
  const conflicts = detectCheckoutConflicts(
    selection,
    await findActiveOverlapCandidates(mapFileId),
  );
  if (conflicts.length > 0) {
    analysis.blockers.push(
      `Området överlappar en befintlig utcheckning (${conflicts[0]!.userLabel}). Avsluta den först.`,
    );
  }

  return analysis;
}

async function ensurePartialPreview(jobId: string, partialBuffer: Buffer): Promise<string> {
  const path = importPartialPreviewPath(jobId);
  try {
    await generateAndStorePreviewSvg(partialBuffer, path);
  } catch (err) {
    console.error("Import partial preview SVG failed:", err);
  }
  return path;
}

/** Regenerera/skapa preview SVG för ett befintligt jobb (t.ex. om den saknas vid GET). */
export async function ensureImportPartialPreviewForJob(jobId: string): Promise<string> {
  const job = await readImportPartialJob(jobId);
  if (!job) throw new Error("Importjobbet hittades inte.");
  const ocdPath = importPartialFilePath(jobId);
  if (!(await fileExists(ocdPath))) {
    throw new Error("Delkartan hittades inte i lagringen.");
  }
  const partialBuffer = await readStoredFile(ocdPath);
  const path = await ensurePartialPreview(jobId, partialBuffer);
  if (!(await fileExists(path))) {
    throw new Error("Kunde inte skapa kartbild för delkartan.");
  }
  if (job.previewSvgPath !== path) {
    await writeJob({ ...job, previewSvgPath: path });
  }
  return path;
}

export async function createAndAnalyzeImportPartial(input: {
  userId: string;
  mapFileId: string;
  mapSlug: string;
  fileName: string;
  partialBuffer: Buffer;
}): Promise<ImportPartialJob> {
  const headVersionId = await getHeadVersionId(input.mapFileId);
  if (!headVersionId) {
    throw new Error("Kartfilen saknar version att jämföra mot.");
  }

  const jobId = randomUUID();
  await uploadFile(importPartialFilePath(jobId), input.partialBuffer);
  const analysis = await analyzeAgainstHead(
    input.mapFileId,
    headVersionId,
    input.partialBuffer,
    input.fileName,
  );
  const previewSvgPath = await ensurePartialPreview(jobId, input.partialBuffer);

  const job: ImportPartialJob = {
    id: jobId,
    userId: input.userId,
    mapFileId: input.mapFileId,
    mapSlug: input.mapSlug,
    headVersionId,
    fileName: input.fileName,
    createdAt: new Date().toISOString(),
    status: "ok",
    analysis,
    previewSvgPath,
  };
  await writeJob(job);
  return job;
}

export async function initImportPartialJob(input: {
  userId: string;
  mapFileId: string;
  mapSlug: string;
  headVersionId: string;
  fileName: string;
}): Promise<{ jobId: string; storagePath: string }> {
  const jobId = randomUUID();
  const job: ImportPartialJob = {
    id: jobId,
    userId: input.userId,
    mapFileId: input.mapFileId,
    mapSlug: input.mapSlug,
    headVersionId: input.headVersionId,
    fileName: input.fileName,
    createdAt: new Date().toISOString(),
    status: "ok",
  };
  await writeJob(job);
  return { jobId, storagePath: importPartialFilePath(jobId) };
}

export async function analyzeExistingImportPartialJob(
  jobId: string,
  userId: string,
): Promise<ImportPartialJob> {
  const job = await readImportPartialJob(jobId);
  if (!job) throw new Error("Importjobbet hittades inte.");
  if (job.userId !== userId) throw new Error("Otillåten åtkomst till jobbet.");
  if (!(await fileExists(importPartialFilePath(jobId)))) {
    throw new Error("Delkartan hittades inte i lagringen.");
  }

  const headVersionId = await getHeadVersionId(job.mapFileId);
  if (!headVersionId) {
    throw new Error("Kartfilen saknar version att jämföra mot.");
  }

  const partialBuffer = await readStoredFile(importPartialFilePath(jobId));
  const analysis = await analyzeAgainstHead(
    job.mapFileId,
    headVersionId,
    partialBuffer,
    job.fileName,
  );
  const previewSvgPath = await ensurePartialPreview(jobId, partialBuffer);

  const merged: ImportPartialJob = {
    ...job,
    headVersionId,
    status: "ok",
    error: undefined,
    analysis,
    previewSvgPath,
  };
  await writeJob(merged);
  return merged;
}

export async function reanalyzeImportPartialJobWithBoundary(input: {
  jobId: string;
  userId: string;
  boundary: CheckoutSelectionGeometry;
}): Promise<ImportPartialJob> {
  const job = await readImportPartialJob(input.jobId);
  if (!job) throw new Error("Importjobbet hittades inte.");
  if (job.userId !== input.userId) throw new Error("Otillåten åtkomst till jobbet.");
  if (!(await fileExists(importPartialFilePath(input.jobId)))) {
    throw new Error("Delkartan hittades inte i lagringen.");
  }

  const headVersionId = await getHeadVersionId(job.mapFileId);
  if (!headVersionId) {
    throw new Error("Kartfilen saknar version att jämföra mot.");
  }

  const partialBuffer = await readStoredFile(importPartialFilePath(input.jobId));
  const analysis = await analyzeAgainstHead(
    job.mapFileId,
    headVersionId,
    partialBuffer,
    job.fileName,
    input.boundary,
  );

  const merged: ImportPartialJob = {
    ...job,
    headVersionId,
    status: "ok",
    error: undefined,
    analysis,
    previewSvgPath: job.previewSvgPath ?? importPartialPreviewPath(input.jobId),
  };
  await writeJob(merged);
  return merged;
}

export async function commitImportPartialJob(input: {
  jobId: string;
  userId: string;
  mapFileId: string;
  mapSlug: string;
  comment?: string | null;
  boundary?: CheckoutSelectionGeometry;
  forceDeleteObjectIndices?: number[];
}): Promise<{ checkoutId: string }> {
  const job = await readImportPartialJob(input.jobId);
  if (!job) throw new Error("Importjobbet hittades inte.");
  if (job.userId !== input.userId) throw new Error("Otillåten åtkomst till jobbet.");
  if (job.mapFileId !== input.mapFileId) throw new Error("Jobbet tillhör ett annat område.");
  if (job.status !== "ok" || !job.analysis) {
    throw new Error(job.error ?? "Analysen är inte klar.");
  }

  let analysis = job.analysis;
  if (input.boundary) {
    const partialBuffer = await readStoredFile(importPartialFilePath(job.id));
    analysis = await analyzeAgainstHead(
      job.mapFileId,
      job.headVersionId,
      partialBuffer,
      job.fileName,
      input.boundary,
    );
    await writeJob({ ...job, analysis });
  }

  if (analysis.blockers.length > 0) {
    throw new Error(analysis.blockers[0]);
  }

  const headVersionId = await getHeadVersionId(input.mapFileId);
  if (!headVersionId || headVersionId !== job.headVersionId) {
    throw new Error("Kartan har fått en ny version sedan analysen. Kör om importguiden.");
  }

  const headVersion = await prisma.mapVersion.findUnique({ where: { id: headVersionId } });
  if (!headVersion) throw new Error("Aktuell kartversion hittades inte.");

  const geometry = checkoutGeometryFromAnalysis(analysis);
  const importExtent = importExtentFromAnalysis(analysis);
  const forceDeleteObjectIndices = [
    ...new Set(
      (input.forceDeleteObjectIndices ?? []).filter((value) => Number.isFinite(value)),
    ),
  ];
  // Skip full head parse here: generateCheckoutExport/crop fills objectIds, and overlap
  // against active checkouts uses geometry (bbox). Double-parsing Mora-sized maps OOMs.
  const selection = {
    geometry,
    objectIds: [] as string[],
    importPartial: true as const,
    importExtent,
    importBoundary: analysis.boundary,
    ...(forceDeleteObjectIndices.length > 0 ? { forceDeleteObjectIndices } : {}),
  };

  const conflicts = detectCheckoutConflicts(
    selection,
    await findActiveOverlapCandidates(input.mapFileId),
  );
  if (conflicts.length > 0) {
    throw new Error(
      `Området överlappar en befintlig utcheckning (${conflicts[0]!.userLabel}). Avsluta den först.`,
    );
  }

  const headBuffer = await readStoredFile(headVersion.storagePath);
  const sourceVersion = normalizeSourceVersion(readOcadHeaderVersion(headBuffer));
  const exportOcadVersion =
    sourceVersion === 10 || sourceVersion === 11 || sourceVersion === 18 ? sourceVersion : 12;

  const checkout = await createCheckout({
    mapFileId: input.mapFileId,
    baseVersionId: headVersionId,
    userId: input.userId,
    selectionType: CheckoutSelectionType.BBOX,
    selection,
    exportOcadVersion,
  });

  try {
    await generateCheckoutExport(
      input.mapFileId,
      checkout.id,
      headVersionId,
      selection,
      exportOcadVersion,
      { sourceBuffer: headBuffer },
    );

    const partialBuffer = await readStoredFile(importPartialFilePath(job.id));
    const checkinPath = buildCheckoutCheckinPath(input.mapFileId, checkout.id);
    const storedRef = await uploadFile(checkinPath, partialBuffer);
    await updateCheckoutCheckin(
      checkout.id,
      storedRef,
      CheckoutStatus.CHECKED_IN,
      input.comment?.trim() || `Importerad delkarta (${job.fileName}) via importguide.`,
    );
  } catch (err) {
    await prisma.mapCheckout.delete({ where: { id: checkout.id } }).catch(() => undefined);
    throw err;
  }

  scheduleCheckoutSubsetDiff(checkout.id);

  await logAction(input.userId, "CHECKOUT_CREATED", "MapCheckout", checkout.id, {
    mapSlug: input.mapSlug,
    importPartial: true,
    fileName: job.fileName,
    boundaryType: analysis.boundary.type,
    forceDeleteCount: forceDeleteObjectIndices.length,
    riskRemovals: analysis.riskRemovals.length,
    extent: bboxFromGeometry(analysis.boundary),
  });
  await logAction(input.userId, "CHECKIN_SUBMITTED", "MapCheckout", checkout.id, {
    mapSlug: input.mapSlug,
    importPartial: true,
    filename: job.fileName,
  });

  return { checkoutId: checkout.id };
}

export { parseImportBoundary };
