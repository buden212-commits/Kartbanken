import { CheckoutMode, CheckoutStatus, STALE_INTEGRATING_MS } from "./types";
import type { CheckoutSubsetDiffResult } from "./subset-diff";
import { computeCheckoutSubsetDiff } from "./subset-diff";
import {
  buildAppendFailedWarning,
  buildModifiedCopySkippedWarning,
  buildOutOfScopeWarnings,
  integrationWarningsToStrings,
  type IntegrationWarning,
} from "./integration-warnings";
import { IntegrationError } from "./integration-error";
import {
  logIntegrationChanges,
  logIntegrationError,
  logIntegrationStep,
  type IntegrationLogContext,
} from "./integration-log";
import { parseStoredCheckoutDiffJson } from "./diff-status";
import type { OcadObjectChange } from "@/lib/ocad/diff-types";
import {
  appendObjectsFromCheckin,
  applyModifiedObjects,
  findChangedObjectsSinceReference,
  readActiveObjectIndices,
  validateOcadBufferStructure,
  type ModifiedObjectPair,
} from "@/lib/ocad/ocad-integrate";
import { markObjectsDeletedByIndices } from "@/lib/ocad/ocad-export-server";
import {
  appendDuplicateStripComment,
  stripExactDuplicatesFromBuffer,
} from "@/lib/ocad/strip-duplicates";
import { processVersionAfterUpload } from "@/lib/ocad/process-version";
import { runAfterResponse } from "@/lib/background";
import {
  findHeadVersion,
  hasManualUploadSinceBase,
  HeadVersionChangedError,
  lockMapAndAllocateVersionNumber,
  MapVersionSource,
} from "@/lib/maps/head-version";
import { buildMapVersionPath, deleteFile, readStoredFile, uploadFile } from "@/lib/storage";
import { sha256 } from "@/lib/hash";
import { prisma } from "@/lib/prisma";

export type IntegrationResult = {
  versionId: string;
  versionNumber: number;
  warnings: IntegrationWarning[];
  warningMessages: string[];
  deletedObjects: number;
  copiedObjects: number;
  replacedObjects: number;
  skippedCopies: number;
  appendedObjects: number;
};

export type IntegrateCheckoutOptions = {
  /** Run version post-processing (preview/diff) after the HTTP response. Default true. */
  postProcessInBackground?: boolean;
  /** Checkin file the admin reviewed; integration aborts if it was replaced since. */
  expectedCheckinStoragePath?: string;
  /** `computedAt` of the diff the admin reviewed; integration aborts if it was recomputed. */
  expectedDiffComputedAt?: string;
};

const CLAIMABLE_STATUSES: CheckoutStatus[] = [
  CheckoutStatus.PENDING_ADMIN_CONFIRM,
  CheckoutStatus.CHECKED_IN,
];

/** Stored diff is only reusable when it was computed for this head and checkin file. */
export function storedDiffUsableForIntegration(
  stored: CheckoutSubsetDiffResult | null,
  headVersionId: string,
  checkinStoragePath: string,
): boolean {
  if (!stored) return false;
  if (stored.headVersionId !== headVersionId) return false;
  if (stored.checkinStoragePath && stored.checkinStoragePath !== checkinStoragePath) return false;
  // Older diffs lack the blocking checks — recompute so they are applied.
  if (!Array.isArray(stored.blockingErrors)) return false;
  // Diffs from before checkinObjectIndex existed carry checkin indices in objectIndex.
  return stored.changes.every(
    (change) => change.changeType === "removed" || typeof change.checkinObjectIndex === "number",
  );
}

async function resolveIntegrationDiff(
  checkoutId: string,
  storedDiffJson: string | null,
  headVersionId: string,
  checkinStoragePath: string,
  logCtx: IntegrationLogContext,
): Promise<CheckoutSubsetDiffResult> {
  const stored = parseStoredCheckoutDiffJson(storedDiffJson);

  if (stored && storedDiffUsableForIntegration(stored, headVersionId, checkinStoragePath)) {
    logIntegrationStep("resolve_diff", logCtx, {
      source: "stored",
      changeCount: stored.changes.length,
      headChangedSinceCheckout: stored.headChangedSinceCheckout ?? false,
    });
    return stored;
  }

  logIntegrationStep("resolve_diff", logCtx, {
    source: "recompute",
    reason: stored ? "stale_stored_diff" : "missing_or_invalid_stored_diff",
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

/** Splits diff changes into head targets (baseline indices) and checkin sources. */
export function planIntegrationChanges(changes: OcadObjectChange[]): {
  removedIndices: Set<number>;
  modifiedPairs: ModifiedObjectPair[];
  addedCheckinIndices: number[];
} {
  const removedIndices = new Set<number>();
  const modifiedPairs: ModifiedObjectPair[] = [];
  const addedCheckinIndices: number[] = [];

  for (const change of changes) {
    if (change.changeType === "removed") {
      removedIndices.add(change.objectIndex);
    } else if (change.changeType === "modified") {
      modifiedPairs.push({
        headIndex: change.objectIndex,
        checkinIndex: change.checkinObjectIndex ?? change.objectIndex,
      });
    } else {
      addedCheckinIndices.push(change.checkinObjectIndex ?? change.objectIndex);
    }
  }

  return { removedIndices, modifiedPairs, addedCheckinIndices };
}

export type ApplyIntegrationResult = {
  buffer: Buffer;
  deleted: number;
  copied: number;
  replaced: number;
  appended: number;
  appendFailed: Array<{ checkinObjectIndex: number; reason: string }>;
  modifyFailed: Array<{ objectIndex: number; reason: string }>;
};

/**
 * Applies a diff to head (pure buffer operation, no DB):
 * - modified with same byte size → copied in place (bytes + index entry)
 * - modified with new size → head object deleted + checkin object appended
 * - removed → marked deleted
 * - added → appended
 */
export function applyIntegrationChanges(
  headBuffer: Buffer,
  checkinBuffer: Buffer,
  changes: OcadObjectChange[],
): ApplyIntegrationResult {
  const plan = planIntegrationChanges(changes);
  const working = Buffer.from(headBuffer);

  const modResult = applyModifiedObjects(working, checkinBuffer, plan.modifiedPairs);

  const deleteSet = new Set(plan.removedIndices);
  for (const pair of modResult.needsReplace) deleteSet.add(pair.headIndex);
  const deleteResult = markObjectsDeletedByIndices(working, deleteSet);

  const replaceCheckinIndices = new Set(modResult.needsReplace.map((pair) => pair.checkinIndex));
  const appendResult = appendObjectsFromCheckin(working, checkinBuffer, [
    ...plan.addedCheckinIndices,
    ...replaceCheckinIndices,
  ]);

  const lostReplacements = appendResult.failed.filter((item) =>
    replaceCheckinIndices.has(item.checkinObjectIndex),
  );
  if (lostReplacements.length > 0) {
    // The original was already marked deleted — appending must not fail or the object is lost.
    throw new IntegrationError(
      `${lostReplacements.length} ändrade objekt kunde inte skrivas om i aktuella versionen.`,
      {
        step: "apply_changes",
        hint: "Integrera ändringarna manuellt i OCAD eller checka in filen på nytt.",
        details: { lostReplacements: lostReplacements.slice(0, 20) },
      },
    );
  }

  return {
    buffer: Buffer.from(appendResult.buffer),
    deleted: deleteResult.deleted - modResult.needsReplace.length,
    copied: modResult.copied,
    replaced: modResult.needsReplace.length,
    appended: appendResult.appended - modResult.needsReplace.length,
    appendFailed: appendResult.failed,
    modifyFailed: modResult.failed.map((item) => ({
      objectIndex: item.headIndex,
      reason: item.reason,
    })),
  };
}

const MODIFY_FAILED_REASON_TEXT: Record<string, string> = {
  missing_in_head: "Objektet finns inte i aktuella versionen.",
  missing_in_checkin: "Objektet finns inte i checkin-filen.",
};

async function claimCheckoutForIntegration(
  checkoutId: string,
  checkinStoragePath: string,
  expectedDiffComputedAt?: string,
): Promise<boolean> {
  const staleBefore = new Date(Date.now() - STALE_INTEGRATING_MS);
  const claimed = await prisma.mapCheckout.updateMany({
    where: {
      id: checkoutId,
      mode: CheckoutMode.OCAD_DESKTOP,
      checkinStoragePath,
      ...(expectedDiffComputedAt
        ? {
            diffSummaryJson: {
              contains: `"computedAt":${JSON.stringify(expectedDiffComputedAt)}`,
            },
          }
        : {}),
      OR: [
        { status: { in: CLAIMABLE_STATUSES } },
        { status: CheckoutStatus.INTEGRATING, updatedAt: { lt: staleBefore } },
      ],
    },
    data: { status: CheckoutStatus.INTEGRATING, updatedAt: new Date() },
  });
  return claimed.count === 1;
}

async function releaseIntegrationClaim(
  checkoutId: string,
  previousStatus: string,
  previousUserConfirmedAt: Date | null,
): Promise<void> {
  const restoreStatus = CLAIMABLE_STATUSES.includes(previousStatus as CheckoutStatus)
    ? previousStatus
    : CheckoutStatus.PENDING_ADMIN_CONFIRM;
  await prisma.mapCheckout
    .updateMany({
      where: { id: checkoutId, status: CheckoutStatus.INTEGRATING },
      data: { status: restoreStatus, userConfirmedAt: previousUserConfirmedAt },
    })
    .catch((err) => {
      console.error("[checkout-integration] release claim failed", { checkoutId, err });
    });
}

/**
 * Checkout integration into the current head:
 * - Atomically claims the checkout (status INTEGRATING) — blocks double integration
 * - Verifies that head objects touched by the diff are unchanged since checkout
 * - Applies removed/modified/added by baseline index → checkin index
 * - Creates the version and marks the checkout INTEGRATED in one transaction,
 *   under a per-map lock that also verifies head did not move meanwhile
 */
export async function integrateCheckout(
  checkoutId: string,
  options: IntegrateCheckoutOptions = {},
): Promise<IntegrationResult> {
  const logCtx: IntegrationLogContext = { checkoutId };
  let uploadedRef: string | null = null;
  let claimed = false;
  let previousStatus: string = CheckoutStatus.PENDING_ADMIN_CONFIRM;
  let previousUserConfirmedAt: Date | null = null;

  try {
    const checkout = await prisma.mapCheckout.findUnique({
      where: { id: checkoutId },
      include: { mapFile: true, baseVersion: true },
    });

    if (!checkout) {
      throw new IntegrationError("Utcheckning hittades inte", { step: "start" });
    }

    logCtx.mapFileId = checkout.mapFileId;
    logIntegrationStep("start", logCtx, { status: checkout.status });

    if (checkout.mode !== CheckoutMode.OCAD_DESKTOP) {
      throw new IntegrationError("Fältredigeringar publiceras från fältredigeringssidan", {
        step: "start",
      });
    }
    if (!checkout.checkinStoragePath) {
      throw new IntegrationError("Utcheckningen saknar incheckad fil", { step: "start" });
    }

    const reviewOutdatedMessage =
      "Incheckningen eller diffen har ändrats sedan du granskade den. Ladda om sidan och granska igen.";
    if (
      options.expectedCheckinStoragePath &&
      options.expectedCheckinStoragePath !== checkout.checkinStoragePath
    ) {
      throw new IntegrationError(reviewOutdatedMessage, { step: "start" });
    }

    previousStatus = checkout.status;
    previousUserConfirmedAt = checkout.userConfirmedAt;
    claimed = await claimCheckoutForIntegration(
      checkoutId,
      checkout.checkinStoragePath,
      options.expectedDiffComputedAt,
    );
    if (!claimed) {
      throw new IntegrationError(
        checkout.status === CheckoutStatus.INTEGRATING
          ? "Integrering pågår redan för den här utcheckningen"
          : CLAIMABLE_STATUSES.includes(checkout.status as CheckoutStatus)
            ? reviewOutdatedMessage
            : "Utcheckningen väntar inte på admin-bekräftelse",
        { step: "start" },
      );
    }

    const checkinStoragePath = checkout.checkinStoragePath;
    logCtx.checkinPath = checkinStoragePath;

    const headVersion = await findHeadVersion(checkout.mapFileId);
    if (!headVersion) {
      throw new IntegrationError("Aktuell version saknas", { step: "start" });
    }
    logCtx.headVersionId = headVersion.id;
    logCtx.headVersionNumber = headVersion.versionNumber;

    if (await hasManualUploadSinceBase(checkout.mapFileId, checkout.baseVersionId, headVersion.id)) {
      throw new IntegrationError(
        "En ny kartfil har laddats upp manuellt efter utcheckningen. Objektnumren i utcheckningen stämmer inte längre med aktuell version.",
        {
          step: "start",
          hint: "Avbryt utcheckningen och gör en ny utcheckning från aktuell version, eller integrera ändringarna manuellt i OCAD.",
        },
      );
    }

    const diff = await resolveIntegrationDiff(
      checkoutId,
      checkout.diffSummaryJson,
      headVersion.id,
      checkinStoragePath,
      logCtx,
    );

    if (!Array.isArray(diff.changes)) {
      throw new IntegrationError("Diff saknar ändringslista — beräkna om diff och försök igen", {
        step: "resolve_diff",
      });
    }
    if (diff.changes.length === 0) {
      throw new IntegrationError("Incheckningen innehåller inga ändringar att integrera", {
        step: "resolve_diff",
        hint: "Avbryt utcheckningen om inget ska ändras.",
      });
    }
    if (diff.blockingErrors?.length) {
      throw new IntegrationError(diff.blockingErrors[0]!, {
        step: "resolve_diff",
        hint: "Rätta felet i OCAD och checka in igen.",
      });
    }

    const plan = planIntegrationChanges(diff.changes);
    logIntegrationStep("load_files", logCtx, {
      removedCount: plan.removedIndices.size,
      modifiedCount: plan.modifiedPairs.length,
      addedCount: plan.addedCheckinIndices.length,
    });

    const [headBuffer, checkinBuffer] = await Promise.all([
      readStoredFile(headVersion.storagePath),
      readStoredFile(checkinStoragePath),
    ]);

    if (headVersion.id !== checkout.baseVersionId) {
      const baseBuffer = await readStoredFile(checkout.baseVersion.storagePath);
      const touched = new Set<number>(plan.removedIndices);
      for (const pair of plan.modifiedPairs) touched.add(pair.headIndex);
      const conflicts = findChangedObjectsSinceReference(headBuffer, baseBuffer, touched);
      if (conflicts.length > 0) {
        throw new IntegrationError(
          `${conflicts.length} objekt som utcheckningen ändrar eller tar bort har ändrats i kartan sedan utcheckningen.`,
          {
            step: "apply_changes",
            hint: "Någon annan har ändrat samma objekt. Gör en ny utcheckning av området eller integrera manuellt i OCAD.",
            details: { conflicts: conflicts.slice(0, 20), conflictCount: conflicts.length },
          },
        );
      }
    }

    const headActiveBefore = readActiveObjectIndices(headBuffer).size;
    const applied = applyIntegrationChanges(headBuffer, checkinBuffer, diff.changes);
    const stripped = await stripExactDuplicatesFromBuffer(applied.buffer, "integration.ocd");
    const working = stripped.buffer;

    logIntegrationStep("apply_changes", logCtx, {
      deletedObjects: applied.deleted,
      copiedObjects: applied.copied,
      replacedObjects: applied.replaced,
      appendedObjects: applied.appended,
      appendFailures: applied.appendFailed.length,
      modifyFailures: applied.modifyFailed.length,
    });

    const addedByCheckinIndex = new Map<number, OcadObjectChange>();
    const modifiedByHeadIndex = new Map<number, OcadObjectChange>();
    for (const change of diff.changes) {
      if (change.changeType === "added") {
        addedByCheckinIndex.set(change.checkinObjectIndex ?? change.objectIndex, change);
      } else if (change.changeType === "modified") {
        modifiedByHeadIndex.set(change.objectIndex, change);
      }
    }

    const appendFailedWarning = buildAppendFailedWarning(applied.appendFailed, addedByCheckinIndex);
    const skippedCopyWarning = buildModifiedCopySkippedWarning(
      applied.modifyFailed.map((item) => ({
        objectIndex: item.objectIndex,
        reason: MODIFY_FAILED_REASON_TEXT[item.reason] ?? item.reason,
      })),
      modifiedByHeadIndex,
    );

    const warnings: IntegrationWarning[] = [
      ...buildOutOfScopeWarnings(diff.outOfScopeWarnings ?? []),
      ...(appendFailedWarning ? [appendFailedWarning] : []),
      ...(skippedCopyWarning ? [skippedCopyWarning] : []),
    ];
    const warningMessages = integrationWarningsToStrings(warnings);

    let structure: ReturnType<typeof validateOcadBufferStructure>;
    try {
      structure = validateOcadBufferStructure(working);
    } catch (validateErr) {
      throw new IntegrationError(
        "Integrerad OCAD-fil kunde inte valideras efter sammanslagning.",
        {
          step: "validate_output",
          hint: "Kontrollera diffen (särskilt ändrade linjer/höjdkurvor) och försök igen, eller integrera manuellt i OCAD.",
          cause: validateErr,
        },
      );
    }

    const expectedActive =
      headActiveBefore - applied.deleted + applied.appended - stripped.extrasRemoved;
    logIntegrationStep("validate_output", logCtx, {
      outputBytes: working.byteLength,
      activeObjects: structure.activeObjects,
      expectedActive,
      warningCount: warnings.length,
    });
    if (structure.activeObjects !== expectedActive) {
      throw new IntegrationError(
        `Antalet objekt efter sammanslagning stämmer inte (${structure.activeObjects}, väntat ${expectedActive}).`,
        { step: "validate_output", hint: "Integrera manuellt i OCAD." },
      );
    }

    const storagePath = buildMapVersionPath(checkout.mapFileId, headVersion.versionNumber + 1);
    logIntegrationStep("upload", logCtx, { storagePath });
    uploadedRef = await uploadFile(storagePath, working);
    const contentHash = sha256(working);

    const uploaderId = checkout.checkedInById ?? checkout.userId;
    const now = new Date();

    let existingDiffSummary: Record<string, unknown> = {};
    if (checkout.diffSummaryJson) {
      try {
        existingDiffSummary = JSON.parse(checkout.diffSummaryJson) as Record<string, unknown>;
      } catch {
        existingDiffSummary = {};
      }
    }

    const version = await prisma.$transaction(
      async (tx) => {
        const nextVersionNumber = await lockMapAndAllocateVersionNumber(
          tx,
          checkout.mapFileId,
          headVersion.id,
        );

        const created = await tx.mapVersion.create({
          data: {
            mapFileId: checkout.mapFileId,
            versionNumber: nextVersionNumber,
            storagePath: uploadedRef!,
            originalFilename: `integrerad-utcheckning-${checkout.id.slice(0, 8)}.ocd`,
            fileSizeBytes: working.byteLength,
            contentHash,
            uploadedById: uploaderId,
            comment: appendDuplicateStripComment(
              checkout.integrationComment?.trim() ||
                `Integrerad utcheckning ${checkout.id.slice(0, 8)}`,
              stripped.extrasRemoved,
              stripped.groupCount,
            ),
            parseStatus: "PENDING",
            source: MapVersionSource.INTEGRATION,
          },
        });

        const updated = await tx.mapCheckout.updateMany({
          where: { id: checkoutId, status: CheckoutStatus.INTEGRATING },
          data: {
            status: CheckoutStatus.INTEGRATED,
            integratedAt: now,
            integratedVersionId: created.id,
            adminConfirmedAt: now,
            userConfirmedAt: previousUserConfirmedAt ?? now,
            diffSummaryJson: JSON.stringify({
              ...existingDiffSummary,
              added: diff.added,
              removed: diff.removed,
              modified: diff.modified,
              headVersionId: diff.headVersionId,
              headChangedSinceCheckout: diff.headChangedSinceCheckout,
              scopedObjectIds: diff.scopedObjectIds,
              outOfScopeWarnings: diff.outOfScopeWarnings,
              validationWarnings: diff.validationWarnings,
              bySymbol: diff.bySymbol,
              changes: diff.changes,
              integrationWarnings: warnings,
              integratedVersionNumber: created.versionNumber,
            }),
          },
        });
        if (updated.count !== 1) {
          throw new IntegrationError("Utcheckningens status ändrades under integreringen", {
            step: "persist",
          });
        }
        return created;
      },
      { timeout: 30_000, maxWait: 30_000 },
    );
    claimed = false;
    uploadedRef = null;

    logIntegrationStep("persist", logCtx, {
      versionId: version.id,
      versionNumber: version.versionNumber,
    });

    const postProcess = async () => {
      try {
        await processVersionAfterUpload(checkout.mapFileId, version.id, headVersion.id);
      } catch (postErr) {
        // Integration succeeded — preview/diff generation must not fail the admin action.
        logIntegrationError("post_process", logCtx, postErr, {
          versionId: version.id,
          versionNumber: version.versionNumber,
        });
      }
    };
    if (options.postProcessInBackground === false) {
      await postProcess();
    } else {
      runAfterResponse(postProcess);
    }

    return {
      versionId: version.id,
      versionNumber: version.versionNumber,
      warnings,
      warningMessages,
      deletedObjects: applied.deleted,
      copiedObjects: applied.copied,
      replacedObjects: applied.replaced,
      skippedCopies: applied.modifyFailed.length,
      appendedObjects: applied.appended,
    };
  } catch (err) {
    if (uploadedRef) {
      await deleteFile(uploadedRef).catch(() => undefined);
    }
    if (claimed) {
      await releaseIntegrationClaim(checkoutId, previousStatus, previousUserConfirmedAt);
    }
    if (err instanceof HeadVersionChangedError) {
      const wrapped = new IntegrationError(err.message, { step: "persist", cause: err });
      logIntegrationError("persist", logCtx, wrapped);
      throw wrapped;
    }
    logIntegrationError(err instanceof IntegrationError ? err.step : "persist", logCtx, err);
    throw err;
  }
}
