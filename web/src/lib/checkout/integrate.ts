import { CheckoutStatus } from "./types";
import type { CheckoutSubsetDiffResult } from "./subset-diff";
import { computeCheckoutSubsetDiff } from "./subset-diff";
import {
  buildAppendFailedWarning,
  buildModifiedCopySkippedWarning,
  buildOutOfScopeWarnings,
  integrationWarningsToStrings,
  type IntegrationWarning,
} from "./integration-warnings";
import {
  appendObjectsFromCheckin,
  readActiveObjectIndices,
} from "@/lib/ocad/ocad-integrate";
import {
  copyMatchingObjectData,
  copySkipReasonText,
  markObjectsDeletedByIndices,
} from "@/lib/ocad/ocad-export-server";
import { processVersionAfterUpload } from "@/lib/ocad/process-version";
import { buildMapVersionPath, readStoredFile, uploadFile } from "@/lib/storage";
import { sha256 } from "@/lib/hash";
import { prisma } from "@/lib/prisma";

export type IntegrationResult = {
  versionId: string;
  versionNumber: number;
  warnings: IntegrationWarning[];
  warningMessages: string[];
  deletedObjects: number;
  copiedObjects: number;
  skippedCopies: number;
  appendedObjects: number;
};

/**
 * Checkout integration:
 * - Starts from current head .ocd
 * - Marks removed objects (in checkout scope) as deleted
 * - Copies modified object bytes from checkin where objectIndex matches
 * - Appends new objects from checkin into head's object index
 */
export async function integrateCheckout(
  checkoutId: string,
  integratedById: string,
): Promise<IntegrationResult> {
  const checkout = await prisma.mapCheckout.findUnique({
    where: { id: checkoutId },
    include: {
      mapFile: true,
      baseVersion: true,
    },
  });

  if (!checkout) {
    throw new Error("Checkout hittades inte");
  }

  if (checkout.status !== CheckoutStatus.PENDING_ADMIN_CONFIRM) {
    throw new Error("Checkout väntar inte på admin-bekräftelse");
  }

  if (!checkout.checkinStoragePath) {
    throw new Error("Checkout saknar incheckad fil");
  }

  const diff: CheckoutSubsetDiffResult = checkout.diffSummaryJson
    ? (JSON.parse(checkout.diffSummaryJson) as CheckoutSubsetDiffResult)
    : await computeCheckoutSubsetDiff(checkoutId);

  const headVersion = await prisma.mapVersion.findFirst({
    where: { mapFileId: checkout.mapFileId },
    orderBy: { versionNumber: "desc" },
  });

  if (!headVersion) {
    throw new Error("Aktuell version saknas");
  }

  // Subset-diff is already scoped to the checkout selection — apply all removed/modified.
  const removedIndices = new Set(
    diff.changes
      .filter((change) => change.changeType === "removed")
      .map((change) => change.objectIndex),
  );

  const modifiedIndices = new Set(
    diff.changes
      .filter((change) => change.changeType === "modified")
      .map((change) => change.objectIndex),
  );

  const [headBuffer, checkinBuffer] = await Promise.all([
    readStoredFile(headVersion.storagePath),
    readStoredFile(checkout.checkinStoragePath),
  ]);

  let working = Buffer.from(headBuffer);
  const deleteResult = markObjectsDeletedByIndices(working, removedIndices);
  const copyResult = copyMatchingObjectData(working, checkinBuffer, modifiedIndices);

  const addedIndices = diff.changes
    .filter((change) => change.changeType === "added")
    .map((change) => change.objectIndex);
  const appendResult = appendObjectsFromCheckin(working, checkinBuffer, addedIndices);
  working = Buffer.from(appendResult.buffer);

  const changesByIndex = new Map(
    diff.changes.map((change) => [change.objectIndex, change]),
  );

  const appendFailedWarning = buildAppendFailedWarning(appendResult.failed, changesByIndex);
  const skippedCopyWarning = buildModifiedCopySkippedWarning(
    copyResult.skippedItems.map((item) => ({
      objectIndex: item.objectIndex,
      reason: copySkipReasonText(item.reason),
    })),
    changesByIndex,
  );

  const warnings: IntegrationWarning[] = [
    ...buildOutOfScopeWarnings(diff.outOfScopeWarnings ?? []),
    ...(appendFailedWarning ? [appendFailedWarning] : []),
    ...(skippedCopyWarning ? [skippedCopyWarning] : []),
  ];
  const warningMessages = integrationWarningsToStrings(warnings);

  // Sanity check: appended objects should appear as active indices in output
  if (appendResult.appended > 0) {
    const active = readActiveObjectIndices(working);
    for (const headIndex of Object.values(appendResult.indexMap)) {
      if (!active.has(headIndex)) {
        console.warn(`Appended object index ${headIndex} not active after integration`);
      }
    }
  }

  const versionNumber =
    (
      await prisma.mapVersion.findFirst({
        where: { mapFileId: checkout.mapFileId },
        orderBy: { versionNumber: "desc" },
        select: { versionNumber: true },
      })
    )?.versionNumber ?? 0;

  const nextVersionNumber = versionNumber + 1;
  const storagePath = buildMapVersionPath(checkout.mapFileId, nextVersionNumber);
  const storedRef = await uploadFile(storagePath, working);
  const contentHash = sha256(working);

  const version = await prisma.mapVersion.create({
    data: {
      mapFileId: checkout.mapFileId,
      versionNumber: nextVersionNumber,
      storagePath: storedRef,
      originalFilename: `integrerad-checkout-${checkout.id.slice(0, 8)}.ocd`,
      fileSizeBytes: working.byteLength,
      contentHash,
      uploadedById: integratedById,
      comment:
        checkout.integrationComment?.trim() ||
        `Integrerad checkout ${checkout.id.slice(0, 8)}`,
      parseStatus: "PENDING",
    },
  });

  let existingDiffSummary: Record<string, unknown> = {};
  if (checkout.diffSummaryJson) {
    try {
      existingDiffSummary = JSON.parse(checkout.diffSummaryJson) as Record<string, unknown>;
    } catch {
      existingDiffSummary = {};
    }
  }

  await prisma.mapCheckout.update({
    where: { id: checkoutId },
    data: {
      status: CheckoutStatus.INTEGRATED,
      integratedAt: new Date(),
      integratedVersionId: version.id,
      adminConfirmedAt: new Date(),
      diffSummaryJson: JSON.stringify({
        ...existingDiffSummary,
        integrationWarnings: warnings,
        integratedVersionNumber: version.versionNumber,
      }),
    },
  });

  await processVersionAfterUpload(checkout.mapFileId, version.id, headVersion.id);

  return {
    versionId: version.id,
    versionNumber: version.versionNumber,
    warnings,
    warningMessages,
    deletedObjects: deleteResult.deleted,
    copiedObjects: copyResult.copied,
    skippedCopies: copyResult.skipped,
    appendedObjects: appendResult.appended,
  };
}
