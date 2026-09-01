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
  logIntegrationChanges,
  logIntegrationError,
  logIntegrationStep,
  type IntegrationLogContext,
} from "./integration-log";
import { parseStoredCheckoutDiffJson } from "./diff-status";
import {
  appendObjectsFromCheckin,
  readActiveObjectIndices,
} from "@/lib/ocad/ocad-integrate";
import {
  copyMatchingObjectData,
  copySkipReasonText,
  markObjectsDeletedByIndices,
} from "@/lib/ocad/ocad-export-server";
import { parseOcadBuffer } from "@/lib/ocad/read";
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

async function resolveIntegrationDiff(
  checkoutId: string,
  storedDiffJson: string | null,
  headVersionId: string,
  logCtx: IntegrationLogContext,
): Promise<CheckoutSubsetDiffResult> {
  const stored = parseStoredCheckoutDiffJson(storedDiffJson);
  const headChanged = stored != null && stored.headVersionId !== headVersionId;

  if (stored && !headChanged) {
    logIntegrationStep("resolve_diff", logCtx, {
      source: "stored",
      changeCount: stored.changes.length,
      headChangedSinceCheckout: stored.headChangedSinceCheckout ?? false,
    });
    return stored;
  }

  logIntegrationStep("resolve_diff", logCtx, {
    source: "recompute",
    reason: stored ? "head_version_changed" : "missing_or_invalid_stored_diff",
    storedHeadVersionId: stored?.headVersionId ?? null,
    currentHeadVersionId: headVersionId,
  });

  const recomputed = await computeCheckoutSubsetDiff(checkoutId);
  logIntegrationChanges(logCtx, recomputed.changes, {
    headChangedSinceCheckout: recomputed.headChangedSinceCheckout,
    outOfScopeCount: recomputed.outOfScopeWarnings?.length ?? 0,
  });
  return recomputed;
}

/**
 * Checkout integration:
 * - Starts from current head .ocd
 * - Marks removed objects (in checkout scope) as deleted
 * - Copies modified object bytes from checkin where object size is unchanged
 * - Appends new objects from checkin into head's object index
 */
export async function integrateCheckout(checkoutId: string): Promise<IntegrationResult> {
  const logCtx: IntegrationLogContext = { checkoutId };

  try {
    const checkout = await prisma.mapCheckout.findUnique({
      where: { id: checkoutId },
      include: {
        mapFile: true,
        baseVersion: true,
      },
    });

    if (!checkout) {
      throw new Error("Utcheckning hittades inte");
    }

    logCtx.mapFileId = checkout.mapFileId;
    logIntegrationStep("start", logCtx, { status: checkout.status });

    if (checkout.status !== CheckoutStatus.PENDING_ADMIN_CONFIRM) {
      throw new Error("Utcheckningen väntar inte på admin-bekräftelse");
    }

    if (!checkout.checkinStoragePath) {
      throw new Error("Utcheckningen saknar incheckad fil");
    }

    logCtx.checkinPath = checkout.checkinStoragePath;

    const headVersion = await prisma.mapVersion.findFirst({
      where: { mapFileId: checkout.mapFileId },
      orderBy: { versionNumber: "desc" },
    });

    if (!headVersion) {
      throw new Error("Aktuell version saknas");
    }

    logCtx.headVersionId = headVersion.id;
    logCtx.headVersionNumber = headVersion.versionNumber;

    const diff = await resolveIntegrationDiff(
      checkoutId,
      checkout.diffSummaryJson,
      headVersion.id,
      logCtx,
    );

    if (!Array.isArray(diff.changes)) {
      throw new Error("Diff saknar ändringslista — beräkna om diff och försök igen");
    }

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

    const addedIndices = diff.changes
      .filter((change) => change.changeType === "added")
      .map((change) => change.objectIndex);

    logIntegrationStep("load_files", logCtx, {
      removedCount: removedIndices.size,
      modifiedCount: modifiedIndices.size,
      addedCount: addedIndices.length,
    });

    const [headBuffer, checkinBuffer] = await Promise.all([
      readStoredFile(headVersion.storagePath),
      readStoredFile(checkout.checkinStoragePath),
    ]);

    let working = Buffer.from(headBuffer);
    const deleteResult = markObjectsDeletedByIndices(working, removedIndices);
    const copyResult = copyMatchingObjectData(working, checkinBuffer, modifiedIndices);
    const appendResult = appendObjectsFromCheckin(working, checkinBuffer, addedIndices);
    working = Buffer.from(appendResult.buffer);

    logIntegrationStep("apply_changes", logCtx, {
      deletedObjects: deleteResult.deleted,
      copiedObjects: copyResult.copied,
      skippedCopies: copyResult.skipped,
      appendedObjects: appendResult.appended,
      appendFailures: appendResult.failed.length,
      appendFailureDetails: appendResult.failed.slice(0, 10).map((item) => {
        const change = diff.changes.find((c) => c.objectIndex === item.checkinObjectIndex);
        return {
          checkinObjectIndex: item.checkinObjectIndex,
          reason: item.reason,
          symbolNumber: change?.symbolNumber,
          symbolName: change?.symbolName,
        };
      }),
      skippedCopyDetails: copyResult.skippedItems.slice(0, 10).map((item) => {
        const change = diff.changes.find((c) => c.objectIndex === item.objectIndex);
        return {
          objectIndex: item.objectIndex,
          reason: item.reason,
          symbolNumber: change?.symbolNumber,
          symbolName: change?.symbolName,
        };
      }),
    });

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

    if (appendResult.appended > 0) {
      const active = readActiveObjectIndices(working);
      for (const headIndex of Object.values(appendResult.indexMap)) {
        if (!active.has(headIndex)) {
          console.warn("[checkout-integration]", {
            step: "sanity_check",
            checkoutId,
            message: `Appended object index ${headIndex} not active after integration`,
          });
        }
      }
    }

    logIntegrationStep("validate_output", logCtx, {
      outputBytes: working.byteLength,
      warningCount: warnings.length,
    });

    try {
      const parsed = await parseOcadBuffer(working, "integration-preview.ocd");
      logIntegrationStep("validate_output", logCtx, {
        objectCount: parsed.objectCount,
        parseOk: true,
      });
    } catch (parseErr) {
      logIntegrationError("validate_output", logCtx, parseErr, {
        outputBytes: working.byteLength,
        addedCount: addedIndices.length,
        modifiedCount: modifiedIndices.size,
        removedCount: removedIndices.size,
      });
      throw new Error(
        "Integrerad OCAD-fil kunde inte valideras efter sammanslagning. " +
          "Kontrollera diff (särskilt ändrade linjer/höjdkurvor) och försök igen, " +
          "eller integrera manuellt i OCAD.",
      );
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

    logIntegrationStep("upload", logCtx, {
      nextVersionNumber,
      storagePath,
    });

    const storedRef = await uploadFile(storagePath, working);
    const contentHash = sha256(working);

    logIntegrationStep("persist", logCtx, {
      nextVersionNumber,
      storedRef,
      contentHash,
    });

    const uploaderId = checkout.checkedInById ?? checkout.userId;

    const version = await prisma.mapVersion.create({
      data: {
        mapFileId: checkout.mapFileId,
        versionNumber: nextVersionNumber,
        storagePath: storedRef,
        originalFilename: `integrerad-utcheckning-${checkout.id.slice(0, 8)}.ocd`,
        fileSizeBytes: working.byteLength,
        contentHash,
        uploadedById: uploaderId,
        comment:
          checkout.integrationComment?.trim() ||
          `Integrerad utcheckning ${checkout.id.slice(0, 8)}`,
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
          added: diff.added,
          removed: diff.removed,
          modified: diff.modified,
          headVersionId: diff.headVersionId,
          headChangedSinceCheckout: diff.headChangedSinceCheckout,
          scopedObjectIds: diff.scopedObjectIds,
          outOfScopeWarnings: diff.outOfScopeWarnings,
          bySymbol: diff.bySymbol,
          changes: diff.changes,
          integrationWarnings: warnings,
          integratedVersionNumber: version.versionNumber,
        }),
      },
    });

    try {
      await processVersionAfterUpload(checkout.mapFileId, version.id, headVersion.id);
    } catch (postErr) {
      // Integration succeeded — preview/diff generation must not fail the admin action.
      logIntegrationError("post_process", logCtx, postErr, {
        versionId: version.id,
        versionNumber: version.versionNumber,
      });
    }

    logIntegrationStep("post_process", logCtx, {
      versionId: version.id,
      versionNumber: version.versionNumber,
      warningCount: warnings.length,
      complete: true,
    });

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
  } catch (err) {
    logIntegrationError("persist", logCtx, err);
    throw err;
  }
}
