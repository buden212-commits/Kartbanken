import { randomUUID } from "crypto";
import { logAction } from "@/lib/audit";
import { runAfterResponse } from "@/lib/background";
import { detectCheckoutConflicts } from "@/lib/checkout/overlap";
import {
  analyzeImportPartial,
  checkoutGeometryFromAnalysis,
  importExtentFromAnalysis,
  type ImportPartialAnalysis,
} from "@/lib/checkout/import-partial-analysis";
import {
  makeImportPartialProgress,
  type ImportPartialProgress,
} from "@/lib/checkout/import-partial-progress";

export { makeImportPartialProgress, type ImportPartialProgress } from "@/lib/checkout/import-partial-progress";
import { objectIdsFromSelection } from "@/lib/checkout/selection-objects";
import {
  createCheckout,
  findActiveOverlapCandidates,
  getHeadVersionId,
  updateCheckoutCheckin,
} from "@/lib/checkout/repository";
import { generateCheckoutExport } from "@/lib/checkout/create-checkout";
import { scheduleCheckoutSubsetDiff } from "@/lib/checkout/diff-status";
import { CheckoutStatus } from "@/lib/checkout/types";
import { readOcadHeaderVersion } from "@/lib/ocad/ocad-export-server";
import { normalizeSourceVersion } from "@/lib/ocad/ocad-export-shared";
import { parseOcadBuffer } from "@/lib/ocad/read";
import { prisma } from "@/lib/prisma";
import {
  buildCheckoutCheckinPath,
  fileExists,
  readStoredFile,
  uploadFile,
} from "@/lib/storage";

export type ImportPartialJobStatus = "pending" | "analyzing" | "ok" | "error";

export type ImportPartialJob = {
  id: string;
  userId: string;
  mapFileId: string;
  mapSlug: string;
  headVersionId: string;
  fileName: string;
  createdAt: string;
  status: ImportPartialJobStatus;
  error?: string;
  analysis?: ImportPartialAnalysis;
  progress?: ImportPartialProgress;
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

async function writeJobProgress(
  job: ImportPartialJob,
  step: Parameters<typeof makeImportPartialProgress>[0],
  detail?: string,
): Promise<ImportPartialJob> {
  const next: ImportPartialJob = {
    ...job,
    status: "analyzing",
    progress: makeImportPartialProgress(step, detail),
    error: undefined,
  };
  await writeJob(next);
  return next;
}

async function analyzeAgainstHead(
  mapFileId: string,
  headVersionId: string,
  partialBuffer: Buffer,
  fileName: string,
  onProgress?: (
    step: Parameters<typeof makeImportPartialProgress>[0],
    detail?: string,
  ) => Promise<void>,
): Promise<ImportPartialAnalysis> {
  await onProgress?.("load_head", "Hämtar aktuell version av den stora kartan…");
  const headVersion = await prisma.mapVersion.findUnique({ where: { id: headVersionId } });
  if (!headVersion) {
    throw new Error("Aktuell kartversion hittades inte.");
  }

  await onProgress?.(
    "parse_files",
    "Parsar stor karta och delkarta — stora filer kan ta flera minuter…",
  );
  const headBuffer = await readStoredFile(headVersion.storagePath);
  const [headSummary, partialSummary] = await Promise.all([
    parseOcadBuffer(headBuffer, headVersion.originalFilename),
    parseOcadBuffer(partialBuffer, fileName),
  ]);

  await onProgress?.(
    "compare",
    `Bygger polygon och filtrerar geografiskt (${partialSummary.objectCount.toLocaleString("sv-SE")} i delkartan, ${headSummary.objectCount.toLocaleString("sv-SE")} totalt på stora kartan)…`,
  );
  const analysis = analyzeImportPartial({
    head: headSummary,
    partial: partialSummary,
  });
  await onProgress?.(
    "compare",
    `Jämför ${analysis.headObjectsInArea.toLocaleString("sv-SE")} objekt i området (av ${analysis.headObjectsTotal.toLocaleString("sv-SE")}); ${partialSummary.objectCount.toLocaleString("sv-SE")} i delkartan. Skyddszon ${analysis.edgeBufferMeters} m.`,
  );

  const geometry = checkoutGeometryFromAnalysis(analysis);
  const importExtent = importExtentFromAnalysis(analysis);
  const importRing = analysis.ring.length >= 3 ? analysis.ring : undefined;
  const selection = {
    geometry,
    objectIds: objectIdsFromSelection(headSummary.objects, geometry),
    importPartial: true as const,
    importExtent,
    ...(importRing ? { importRing, importEdgeBuffer: analysis.ringBufferMeters } : {}),
  };

  await onProgress?.("overlap", "Ser efter aktiva utcheckningar i samma område…");
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

/** Sparar uppladdad delkarta. Klienten startar analys via PUT och pollar status. */
export async function createImportPartialFromUpload(input: {
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

  const job: ImportPartialJob = {
    id: jobId,
    userId: input.userId,
    mapFileId: input.mapFileId,
    mapSlug: input.mapSlug,
    headVersionId,
    fileName: input.fileName,
    createdAt: new Date().toISOString(),
    status: "pending",
    progress: makeImportPartialProgress("upload", "Filen är sparad — startar analys…"),
  };
  await writeJob(job);
  return job;
}

/** @deprecated Använd createImportPartialFromUpload + startImportPartialAnalysis. */
export async function createAndScheduleImportPartial(input: {
  userId: string;
  mapFileId: string;
  mapSlug: string;
  fileName: string;
  partialBuffer: Buffer;
}): Promise<ImportPartialJob> {
  return createImportPartialFromUpload(input);
}

/** Synkron analys (tester / nödfall). */
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
  let job: ImportPartialJob = {
    id: jobId,
    userId: input.userId,
    mapFileId: input.mapFileId,
    mapSlug: input.mapSlug,
    headVersionId,
    fileName: input.fileName,
    createdAt: new Date().toISOString(),
    status: "analyzing",
    progress: makeImportPartialProgress("queued"),
  };
  await writeJob(job);

  try {
    const analysis = await analyzeAgainstHead(
      input.mapFileId,
      headVersionId,
      input.partialBuffer,
      input.fileName,
      async (step, detail) => {
        job = await writeJobProgress(job, step, detail);
      },
    );
    job = {
      ...job,
      status: "ok",
      error: undefined,
      analysis,
      progress: makeImportPartialProgress("done"),
    };
    await writeJob(job);
    return job;
  } catch (err) {
    job = {
      ...job,
      status: "error",
      error: err instanceof Error ? err.message : "Kunde inte analysera delkartan",
      progress: makeImportPartialProgress(
        job.progress?.step ?? "parse_files",
        err instanceof Error ? err.message : undefined,
      ),
    };
    await writeJob(job);
    throw err;
  }
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
    status: "pending",
    progress: makeImportPartialProgress("upload", "Väntar på uppladdning…"),
  };
  await writeJob(job);
  return { jobId, storagePath: importPartialFilePath(jobId) };
}

export function scheduleImportPartialAnalysis(jobId: string, userId: string): void {
  runAfterResponse(async () => {
    await analyzeExistingImportPartialJob(jobId, userId);
  });
}

/**
 * Startar analys synkront (med progress-skrivning så parallella GET kan polla).
 * Undviker after()-bakgrund som ofta dör tyst på stora OCAD-filer.
 */
export async function startImportPartialAnalysis(input: {
  jobId: string;
  userId: string;
  mapFileId: string;
}): Promise<ImportPartialJob> {
  const job = await readImportPartialJob(input.jobId);
  if (!job) throw new Error("Importjobbet hittades inte.");
  if (job.userId !== input.userId) throw new Error("Otillåten åtkomst till jobbet.");
  if (job.mapFileId !== input.mapFileId) throw new Error("Jobbet tillhör ett annat område.");

  if (job.status === "ok" && job.analysis) {
    return job;
  }

  if (!(await fileExists(importPartialFilePath(input.jobId)))) {
    throw new Error("Delkartan hittades inte i lagringen.");
  }

  return analyzeExistingImportPartialJob(input.jobId, input.userId);
}

export async function analyzeExistingImportPartialJob(
  jobId: string,
  userId: string,
): Promise<ImportPartialJob> {
  let job = await readImportPartialJob(jobId);
  if (!job) throw new Error("Importjobbet hittades inte.");
  if (job.userId !== userId) throw new Error("Otillåten åtkomst till jobbet.");
  if (!(await fileExists(importPartialFilePath(jobId)))) {
    throw new Error("Delkartan hittades inte i lagringen.");
  }

  if (job.status === "ok" && job.analysis) {
    return job;
  }

  job = await writeJobProgress(job, "queued", "Startar analys…");

  try {
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
      async (step, detail) => {
        job = await writeJobProgress(job!, step, detail);
      },
    );

    const merged: ImportPartialJob = {
      ...job,
      headVersionId,
      status: "ok",
      error: undefined,
      analysis,
      progress: makeImportPartialProgress("done"),
    };
    await writeJob(merged);
    return merged;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Kunde inte analysera delkartan";
    const failed: ImportPartialJob = {
      ...job,
      status: "error",
      error: message,
      progress: makeImportPartialProgress(job.progress?.step ?? "parse_files", message),
    };
    await writeJob(failed);
    throw err;
  }
}

/** Nycklar som «removed:1234» — allt annat ignoreras hellre än att stoppa importen. */
function normalizeExcludedKeys(keys: string[] | undefined): string[] {
  if (!keys) return [];
  return [...new Set(keys.filter((key) => /^(added|removed|modified):\d+$/.test(key)))];
}

export async function commitImportPartialJob(input: {
  jobId: string;
  userId: string;
  mapFileId: string;
  mapSlug: string;
  comment?: string | null;
  /** Ändringar redaktören kryssade bort i guiden — de ska inte nå kartan. */
  excluded?: string[];
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
  const importRing = job.analysis.ring.length >= 3 ? job.analysis.ring : undefined;
  const excluded = normalizeExcludedKeys(input.excluded);
  // Skip full head parse here: generateCheckoutExport/crop fills objectIds, and overlap
  // against active checkouts uses geometry. Double-parsing Mora-sized maps OOMs.
  const selection = {
    geometry,
    objectIds: [] as string[],
    importPartial: true as const,
    importExtent,
    ...(importRing ? { importRing, importEdgeBuffer: job.analysis.ringBufferMeters } : {}),
    ...(excluded.length > 0 ? { importExcluded: excluded } : {}),
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
    selectionType: geometry.type,
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
    excludedChanges: excluded.length,
  });
  await logAction(input.userId, "CHECKIN_SUBMITTED", "MapCheckout", checkout.id, {
    mapSlug: input.mapSlug,
    importPartial: true,
    filename: job.fileName,
  });

  return { checkoutId: checkout.id };
}
