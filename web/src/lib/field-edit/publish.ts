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
import { processVersionAfterUpload } from "@/lib/ocad/process-version";
import { filterObjectsInSelection } from "@/lib/checkout/selection-objects";
import { parseSelectionJson, serializeSelection } from "@/lib/checkout/types";
import { prisma } from "@/lib/prisma";
import { buildMapVersionPath, readStoredFile, uploadFile } from "@/lib/storage";
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
  options?: { publish?: boolean; comment?: string | null; ops?: FieldEditOps },
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
  if (checkout.status !== CheckoutStatus.ACTIVE) {
    throw new Error("Fältredigeringen är inte aktiv");
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

  const headVersion = await prisma.mapVersion.findFirst({
    where: { mapFileId: checkout.mapFileId },
    orderBy: { versionNumber: "desc" },
  });
  if (!headVersion) {
    throw new Error("Aktuell version saknas");
  }
  if (headVersion.id !== checkout.baseVersionId) {
    throw new Error(
      "Kartan har fått en ny version sedan fältredigeringen startades — avbryt och starta om",
    );
  }

  const headBuffer = await readStoredFile(headVersion.storagePath);
  const { buffer: working, deletedCount, addedCount, modifiedCount } =
    await applyFieldEditOps(headBuffer, ops);

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
  const comment =
    options?.comment?.trim() ||
    `Fältredigering (${counts.deletes} borttagna, ${counts.adds} nya, ${counts.modifies} ändrade)`;

  const version = await prisma.mapVersion.create({
    data: {
      mapFileId: checkout.mapFileId,
      versionNumber: nextVersionNumber,
      storagePath: storedRef,
      originalFilename: `faltredigering-${checkout.id.slice(0, 8)}.ocd`,
      fileSizeBytes: working.byteLength,
      contentHash,
      uploadedById: userId,
      comment,
      parseStatus: "PENDING",
    },
  });

  await prisma.mapCheckout.update({
    where: { id: checkoutId },
    data: {
      status: CheckoutStatus.INTEGRATED,
      integratedAt: new Date(),
      integratedVersionId: version.id,
      adminConfirmedAt: new Date(),
      integrationComment: comment,
      editOpsJson: serializeFieldEditOps(ops),
    },
  });

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
