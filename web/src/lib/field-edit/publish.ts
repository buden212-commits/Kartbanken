import { logAction } from "@/lib/audit";
import { CheckoutMode, CheckoutStatus } from "@/lib/checkout/types";
import { applyFieldEditOps, validateFieldEditOps } from "@/lib/field-edit/apply-ops";
import {
  countFieldEditChanges,
  parseFieldEditOps,
  serializeFieldEditOps,
  type FieldEditOps,
} from "@/lib/field-edit/types";
import { setVersionPublished } from "@/lib/maps/publish-version";
import { parseOcadBuffer } from "@/lib/ocad/read";
import {
  appendDuplicateStripComment,
  stripExactDuplicatesFromBuffer,
} from "@/lib/ocad/strip-duplicates";
import { processVersionAfterUpload } from "@/lib/ocad/process-version";
import { filterObjectsInSelection } from "@/lib/checkout/selection-objects";
import { parseSelectionJson, serializeSelection } from "@/lib/checkout/types";
import { prisma } from "@/lib/prisma";
import { buildMapVersionPath, deleteFile, readStoredFile, uploadFile } from "@/lib/storage";
import {
  findHeadVersion,
  lockMapAndAllocateVersionNumber,
  MapVersionSource,
} from "@/lib/maps/head-version";
import { sha256 } from "@/lib/hash";

export type PublishFieldEditResult = {
  versionId: string;
  versionNumber: number;
  published: boolean;
  deletedCount: number;
  addedCount: number;
  modifiedCount: number;
};

export async function publishFieldEditSession(
  checkoutId: string,
  userId: string,
  options?: {
    publish?: boolean;
    comment?: string | null;
    ops?: FieldEditOps;
    allowPendingAdmin?: boolean;
  },
): Promise<PublishFieldEditResult> {
  const checkout = await prisma.mapCheckout.findUnique({
    where: { id: checkoutId },
    include: { mapFile: true, baseVersion: true },
  });

  if (!checkout) {
    throw new Error("Fältredigering hittades inte");
  }
  if (checkout.mode !== CheckoutMode.FIELD_EDIT) {
    throw new Error("Inte en fältredigeringssession");
  }
  const allowedStatuses: CheckoutStatus[] = options?.allowPendingAdmin
    ? [CheckoutStatus.ACTIVE, CheckoutStatus.PENDING_ADMIN_CONFIRM]
    : [CheckoutStatus.ACTIVE];
  if (!allowedStatuses.includes(checkout.status as CheckoutStatus)) {
    throw new Error("Fältredigeringen kan inte publiceras i nuvarande status");
  }

  const ops = options?.ops ?? parseFieldEditOps(checkout.editOpsJson);
  const validationError = await validateFieldEditOps(
    await readStoredFile(checkout.baseVersion.storagePath),
    checkout.baseVersion.originalFilename,
    checkout.selectionJson,
    ops,
  );
  if (validationError) {
    throw new Error(validationError);
  }

  const headVersion = await findHeadVersion(checkout.mapFileId);
  if (!headVersion) {
    throw new Error("Aktuell version saknas");
  }
  if (headVersion.id !== checkout.baseVersionId) {
    throw new Error(
      "Kartan har fått en ny version sedan fältredigeringen startades — avbryt och starta om",
    );
  }

  const headBuffer = await readStoredFile(headVersion.storagePath);
  const applied = await applyFieldEditOps(headBuffer, ops);
  const stripped = await stripExactDuplicatesFromBuffer(applied.buffer, "field-edit-preview.ocd");
  const working = stripped.buffer;
  const { deletedCount, addedCount, modifiedCount } = applied;

  try {
    await parseOcadBuffer(working, "field-edit-preview.ocd");
  } catch {
    throw new Error("Resultatfilen kunde inte valideras efter fältredigering");
  }

  const nextVersionNumber = headVersion.versionNumber + 1;
  const storagePath = buildMapVersionPath(checkout.mapFileId, nextVersionNumber);
  const storedRef = await uploadFile(storagePath, working);
  const contentHash = sha256(working);

  const counts = countFieldEditChanges(ops);
  const comment = appendDuplicateStripComment(
    options?.comment?.trim() ||
      `Fältredigering (${counts.deletes} borttagna, ${counts.adds} nya, ${counts.modifies} ändrade)`,
    stripped.extrasRemoved,
    stripped.groupCount,
  );

  let version;
  try {
    version = await prisma.$transaction(
      async (tx) => {
        const versionNumber = await lockMapAndAllocateVersionNumber(
          tx,
          checkout.mapFileId,
          headVersion.id,
        );
        const created = await tx.mapVersion.create({
          data: {
            mapFileId: checkout.mapFileId,
            versionNumber,
            storagePath: storedRef,
            originalFilename: `faltredigering-${checkout.id.slice(0, 8)}.ocd`,
            source: MapVersionSource.FIELD_EDIT,
            fileSizeBytes: working.byteLength,
            contentHash,
            uploadedById: userId,
            comment,
            parseStatus: "PENDING",
          },
        });

        const updated = await tx.mapCheckout.updateMany({
          where: { id: checkoutId, status: { in: allowedStatuses } },
          data: {
            status: CheckoutStatus.INTEGRATED,
            integratedAt: new Date(),
            integratedVersionId: created.id,
            adminConfirmedAt: new Date(),
            integrationComment: comment,
            editOpsJson: serializeFieldEditOps(ops),
          },
        });
        if (updated.count !== 1) {
          throw new Error("Fältredigeringens status ändrades medan den publicerades");
        }
        return created;
      },
      { timeout: 30_000, maxWait: 30_000 },
    );
  } catch (err) {
    await deleteFile(storedRef).catch(() => undefined);
    throw err;
  }

  try {
    await processVersionAfterUpload(checkout.mapFileId, version.id, headVersion.id);
  } catch (postErr) {
    console.error("field-edit post-process failed:", postErr);
  }

  let published = false;
  if (options?.publish) {
    const publishResult = await setVersionPublished(checkout.mapFileId, version.id, true);
    if (publishResult.ok) {
      published = true;
    }
  }

  await logAction(userId, "FIELD_EDIT_PUBLISHED", "MapCheckout", checkoutId, {
    mapSlug: checkout.mapFile.slug,
    versionNumber: version.versionNumber,
    deletedCount,
    addedCount,
    modifiedCount,
    published,
  });

  return {
    versionId: version.id,
    versionNumber: version.versionNumber,
    published,
    deletedCount,
    addedCount,
    modifiedCount,
  };
}

export async function enrichFieldEditSelection(
  mapFileId: string,
  baseVersionId: string,
  selectionJson: string,
): Promise<string> {
  const version = await prisma.mapVersion.findUnique({ where: { id: baseVersionId } });
  if (!version) throw new Error("Basversion hittades inte");

  const selection = parseSelectionJson(selectionJson);
  const buffer = await readStoredFile(version.storagePath);
  const parsed = await parseOcadBuffer(buffer, version.originalFilename);
  const objectIds = filterObjectsInSelection(parsed.objects, selection.geometry).map((obj) =>
    String(obj.objectIndex),
  );

  return serializeSelection({
    ...selection,
    objectIds,
  });
}

export function countFieldEditOpsSummary(ops: FieldEditOps): ReturnType<typeof countFieldEditChanges> {
  return countFieldEditChanges(ops);
}
