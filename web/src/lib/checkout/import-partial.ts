import { randomUUID } from "crypto";
import { logAction } from "@/lib/audit";
import { detectCheckoutConflicts } from "@/lib/checkout/overlap";
import {
  analyzeImportPartial,
  checkoutGeometryFromAnalysis,
  importExtentFromAnalysis,
  type ImportPartialAnalysis,
} from "@/lib/checkout/import-partial-analysis";
import { objectIdsFromSelection } from "@/lib/checkout/selection-objects";
import {
  createCheckout,
  findActiveOverlapCandidates,
  getHeadVersionId,
  updateCheckoutCheckin,
} from "@/lib/checkout/repository";
import { generateCheckoutExport } from "@/lib/checkout/create-checkout";
import { scheduleCheckoutSubsetDiff } from "@/lib/checkout/diff-status";
import { CheckoutSelectionType, CheckoutStatus } from "@/lib/checkout/types";
import { parseOcadBuffer } from "@/lib/ocad/read";
import { normalizeSourceVersion } from "@/lib/ocad/ocad-export-shared";
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
};

function metaPath(jobId: string): string {
  return `temp-import/${jobId}/meta.json`;
}

export function importPartialFilePath(jobId: string): string {
  return `temp-import/${jobId}/partial.ocd`;
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

  const merged: ImportPartialJob = {
    ...job,
    headVersionId,
    status: "ok",
    error: undefined,
    analysis,
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
}): Promise<{ checkoutId: string }> {
  const job = await readImportPartialJob(input.jobId);
  if (!job) throw new Error("Importjobbet hittades inte.");
  if (job.userId !== input.userId) throw new Error("Otillåten åtkomst till jobbet.");
  if (job.mapFileId !== input.mapFileId) throw new Error("Jobbet tillhör ett annat område.");
  if (job.status !== "ok" || !job.analysis) {
    throw new Error(job.error ?? "Analysen är inte klar.");
  }
  if (job.analysis.blockers.length > 0) {
    throw new Error(job.analysis.blockers[0]);
  }

  const headVersionId = await getHeadVersionId(input.mapFileId);
  if (!headVersionId || headVersionId !== job.headVersionId) {
    throw new Error("Kartan har fått en ny version sedan analysen. Kör om importguiden.");
  }

  const headVersion = await prisma.mapVersion.findUnique({ where: { id: headVersionId } });
  if (!headVersion) throw new Error("Aktuell kartversion hittades inte.");

  const geometry = checkoutGeometryFromAnalysis(job.analysis);
  const importExtent = importExtentFromAnalysis(job.analysis);
  const headBuffer = await readStoredFile(headVersion.storagePath);
  const headSummary = await parseOcadBuffer(headBuffer, headVersion.originalFilename);
  const selection = {
    geometry,
    objectIds: objectIdsFromSelection(headSummary.objects, {
      type: CheckoutSelectionType.BBOX,
      bbox: importExtent,
    }),
    importPartial: true as const,
    importExtent,
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

  const sourceVersion = normalizeSourceVersion(headSummary.ocadVersion);
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
  });
  await logAction(input.userId, "CHECKIN_SUBMITTED", "MapCheckout", checkout.id, {
    mapSlug: input.mapSlug,
    importPartial: true,
    filename: job.fileName,
  });

  return { checkoutId: checkout.id };
}
