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
  IntegrationError,
  toIntegrationError,
} from "./integration-error";
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
  validateOcadBufferStructure,
} from "@/lib/ocad/ocad-integrate";
import {
  appendOcadMapNotesIfComment,
  displayMapNotesUserName,
  extractOcadMapNotes,
} from "@/lib/ocad/ocad-map-notes";
import {
  copyMatchingObjectData,
  copySkipReasonText,
  markObjectsDeletedByIndices,
} from "@/lib/ocad/ocad-export-server";
import { processVersionAfterUpload } from "@/lib/ocad/process-version";
import { runAfterResponse } from "@/lib/background";
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
  try {
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
  } catch (err) {
    throw toIntegrationError(err, "resolve_diff", "Kunde inte läsa eller beräkna diff", {
      hint: "Öppna utcheckningen, vänta tills diff är klar, eller beräkna om diff och försök igen.",
    });
  }
}

/**
 * Checkout integration:
 * - Starts from current head .ocd
 * - Marks removed objects (in checkout scope) as deleted
 * - Copies modified object bytes from checkin where object size is unchanged
 * - Appends new objects from checkin into head's object index
 */
export async function integrateCheckout(
  checkoutId: string,
  integratedById: string,
): Promise<IntegrationResult> {
  const logCtx: IntegrationLogContext = { checkoutId };

  try {
    const checkout = await prisma.mapCheckout.findUnique({
      where: { id: checkoutId },
      include: {
        mapFile: true,
        baseVersion: true,
        user: { select: { name: true, email: true } },
      },
    });

    if (!checkout) {
      throw new IntegrationError("Utcheckning hittades inte", { step: "start" });
    }

    logCtx.mapFileId = checkout.mapFileId;
    logIntegrationStep("start", logCtx, { status: checkout.status });

    if (checkout.status !== CheckoutStatus.PENDING_ADMIN_CONFIRM) {
      throw new IntegrationError("Utcheckningen väntar inte på admin-bekräftelse", {
        step: "start",
        details: { status: checkout.status },
      });
    }

    if (!checkout.checkinStoragePath) {
      throw new IntegrationError("Utcheckningen saknar incheckad fil", { step: "start" });
    }

    logCtx.checkinPath = checkout.checkinStoragePath;

    const headVersion = await prisma.mapVersion.findFirst({
      where: { mapFileId: checkout.mapFileId },
      orderBy: { versionNumber: "desc" },
    });

    if (!headVersion) {
      throw new IntegrationError("Aktuell version saknas", { step: "start" });
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
      throw new IntegrationError(
        "Diff saknar ändringslista — beräkna om diff och försök igen",
        { step: "resolve_diff" },
      );
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
      headBytes: headVersion.fileSizeBytes,
    });

    let headBuffer: Buffer;
    let checkinBuffer: Buffer;
    try {
      [headBuffer, checkinBuffer] = await Promise.all([
        readStoredFile(headVersion.storagePath),
        readStoredFile(checkout.checkinStoragePath),
      ]);
    } catch (err) {
      throw toIntegrationError(err, "load_files", "Kunde inte ladda kartfiler från lagring", {
        hint: "Kontrollera att aktuell version och incheckningen finns kvar i lagringen.",
        details: {
          headPath: headVersion.storagePath,
          checkinPath: checkout.checkinStoragePath,
        },
      });
    }

    let working: Buffer;
    let deleteResult: ReturnType<typeof markObjectsDeletedByIndices>;
    let copyResult: ReturnType<typeof copyMatchingObjectData>;
    let appendResult: ReturnType<typeof appendObjectsFromCheckin>;
    try {
      working = Buffer.from(headBuffer);
      deleteResult = markObjectsDeletedByIndices(working, removedIndices);
      copyResult = copyMatchingObjectData(working, checkinBuffer, modifiedIndices);
      appendResult = appendObjectsFromCheckin(working, checkinBuffer, addedIndices);
      working = appendResult.buffer;
    } catch (err) {
      throw toIntegrationError(
        err,
        "apply_changes",
        "Kunde inte applicera borttagningar/ändringar/tillägg i OCAD-filen",
        {
          hint:
            "Stora diffar eller trasiga objekt kan stoppa sammanslagningen. Granska diffen och försök igen, eller integrera manuellt i OCAD.",
          details: {
            removedCount: removedIndices.size,
            modifiedCount: modifiedIndices.size,
            addedCount: addedIndices.length,
          },
        },
      );
    }

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

    try {
      const structure = validateOcadBufferStructure(working);
      logIntegrationStep("validate_output", logCtx, {
        outputBytes: structure.bytes,
        activeObjects: structure.activeObjects,
        ocadVersion: structure.version,
        warningCount: warnings.length,
        parseOk: true,
        validation: "structure",
      });
    } catch (parseErr) {
      const wrapped = toIntegrationError(
        parseErr,
        "validate_output",
        "Integrerad OCAD-fil kunde inte valideras efter sammanslagning",
        {
          hint:
            "Kontrollera diff (särskilt ändrade linjer/höjdkurvor) och försök igen, eller integrera manuellt i OCAD.",
          details: {
            outputBytes: working.byteLength,
            addedCount: addedIndices.length,
            modifiedCount: modifiedIndices.size,
            removedCount: removedIndices.size,
          },
        },
      );
      logIntegrationError("validate_output", logCtx, wrapped);
      throw wrapped;
    }

    const notes = appendOcadMapNotesIfComment(working, {
      comment: checkout.integrationComment,
      userName: displayMapNotesUserName(checkout.user),
    });
    if (notes.changed) {
      working = Buffer.from(notes.buffer);
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

    let storedRef: string;
    let contentHash: string;
    try {
      storedRef = await uploadFile(storagePath, working);
      contentHash = sha256(working);
    } catch (err) {
      throw toIntegrationError(err, "upload", "Kunde inte ladda upp den integrerade filen", {
        hint: "Kontrollera Blob-lagring / diskutrymme och försök igen.",
        details: { storagePath, bytes: working.byteLength },
      });
    }

    logIntegrationStep("persist", logCtx, {
      nextVersionNumber,
      storedRef,
      contentHash,
    });

    let version: { id: string; versionNumber: number };
    try {
      version = await prisma.mapVersion.create({
        data: {
          mapFileId: checkout.mapFileId,
          versionNumber: nextVersionNumber,
          storagePath: storedRef,
          originalFilename: `integrerad-utcheckning-${checkout.id.slice(0, 8)}.ocd`,
          fileSizeBytes: working.byteLength,
          contentHash,
          uploadedById: integratedById,
          comment:
            checkout.integrationComment?.trim() ||
            `Integrerad utcheckning ${checkout.id.slice(0, 8)}`,
          mapNotes: extractOcadMapNotes(working),
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
    } catch (err) {
      throw toIntegrationError(err, "persist", "Kunde inte spara den nya versionen i databasen", {
        hint: "Filen kan ha laddats upp men statusen sparades inte. Kontrollera versionshistoriken innan du försöker igen.",
        details: { nextVersionNumber, storedRef },
      });
    }

    const versionId = version.id;
    const createdVersionNumber = version.versionNumber;
    const mapFileId = checkout.mapFileId;
    const previousVersionId = headVersion.id;
    const warningCount = warnings.length;

    // Kartbild/diff för stora filer (Mora) kan OOM:a — kör efter HTTP-svar så admin
    // inte får HTML 500 trots att versionen redan sparats.
    runAfterResponse(async () => {
      try {
        await processVersionAfterUpload(mapFileId, versionId, previousVersionId);
        logIntegrationStep("post_process", logCtx, {
          versionId,
          versionNumber: createdVersionNumber,
          warningCount,
          complete: true,
        });
      } catch (postErr) {
        logIntegrationError("post_process", logCtx, postErr, {
          versionId,
          versionNumber: createdVersionNumber,
        });
      }
    });

    logIntegrationStep("persist", logCtx, {
      versionId,
      versionNumber: createdVersionNumber,
      warningCount,
      deferredPostProcess: true,
      complete: true,
    });

    return {
      versionId,
      versionNumber: createdVersionNumber,
      warnings,
      warningMessages,
      deletedObjects: deleteResult.deleted,
      copiedObjects: copyResult.copied,
      skippedCopies: copyResult.skipped,
      appendedObjects: appendResult.appended,
    };
  } catch (err) {
    const step = err instanceof IntegrationError ? err.step : "persist";
    logIntegrationError(step, logCtx, err);
    throw err instanceof IntegrationError
      ? err
      : toIntegrationError(err, "persist", "Integration misslyckades");
  }
}
