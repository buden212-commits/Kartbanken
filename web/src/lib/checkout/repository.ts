import { prisma } from "@/lib/prisma";
import { CheckoutMode, CheckoutStatus, LOCKING_CHECKOUT_STATUSES, parseSelectionJson, serializeSelection, type CheckoutSelection, type CheckoutSelectionType, type ExistingCheckoutForOverlap } from "./types";
import { parseFieldEditOps } from "@/lib/field-edit/types";

const checkoutWithUserSelect = {
  id: true,
  mapFileId: true,
  baseVersionId: true,
  userId: true,
  status: true,
  selectionType: true,
  selectionJson: true,
  exportStoragePath: true,
  checkinStoragePath: true,
  checkedInById: true,
  diffSummaryJson: true,
  userConfirmedAt: true,
  adminConfirmedAt: true,
  integratedAt: true,
  integratedVersionId: true,
  cancelledAt: true,
  cancelledById: true,
  cancelReason: true,
  integrationComment: true,
  reminderSentAt: true,
  exportOcadVersion: true,
  mode: true,
  editOpsJson: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} as const;

export type MapCheckoutRecord = Awaited<ReturnType<typeof getCheckoutById>>;

export async function getHeadVersionId(mapFileId: string): Promise<string | null> {
  const head = await prisma.mapVersion.findFirst({
    where: { mapFileId },
    orderBy: { versionNumber: "desc" },
    select: { id: true },
  });
  return head?.id ?? null;
}

export async function findActiveCheckoutsForMap(mapFileId: string) {
  return prisma.mapCheckout.findMany({
    where: {
      mapFileId,
      status: { in: LOCKING_CHECKOUT_STATUSES },
      mode: CheckoutMode.OCAD_DESKTOP,
    },
    select: checkoutWithUserSelect,
    orderBy: { createdAt: "asc" },
  });
}

export async function findActiveFieldEditsForMap(mapFileId: string) {
  return prisma.mapCheckout.findMany({
    where: {
      mapFileId,
      mode: CheckoutMode.FIELD_EDIT,
      status: CheckoutStatus.ACTIVE,
    },
    select: checkoutWithUserSelect,
    orderBy: { createdAt: "asc" },
  });
}

/** All area-locking sessions (desktop checkout + field edit) for overlap checks. */
export async function findActiveAreaLocksForMap(mapFileId: string) {
  return prisma.mapCheckout.findMany({
    where: {
      mapFileId,
      status: { in: LOCKING_CHECKOUT_STATUSES },
    },
    select: checkoutWithUserSelect,
    orderBy: { createdAt: "asc" },
  });
}

export async function findCheckoutsForMap(mapFileId: string, statuses?: CheckoutStatus[]) {
  return prisma.mapCheckout.findMany({
    where: {
      mapFileId,
      ...(statuses ? { status: { in: statuses } } : {}),
    },
    select: checkoutWithUserSelect,
    orderBy: { createdAt: "desc" },
  });
}

export function toOverlapCandidate(
  checkout: Awaited<ReturnType<typeof findActiveCheckoutsForMap>>[number],
): ExistingCheckoutForOverlap {
  return {
    id: checkout.id,
    userId: checkout.userId,
    userName: checkout.user.name,
    userEmail: checkout.user.email,
    status: checkout.status as ExistingCheckoutForOverlap["status"],
    selectionType: checkout.selectionType as CheckoutSelectionType,
    selection: parseSelectionJson(checkout.selectionJson),
    createdAt: checkout.createdAt,
  };
}

export async function findActiveOverlapCandidates(mapFileId: string): Promise<ExistingCheckoutForOverlap[]> {
  const rows = await findActiveAreaLocksForMap(mapFileId);
  return rows.map(toOverlapCandidate);
}

export async function getCheckoutById(mapFileId: string, checkoutId: string) {
  return prisma.mapCheckout.findFirst({
    where: { id: checkoutId, mapFileId },
    select: checkoutWithUserSelect,
  });
}

export type CreateCheckoutInput = {
  mapFileId: string;
  baseVersionId: string;
  userId: string;
  selectionType: CheckoutSelectionType;
  selection: CheckoutSelection;
  exportStoragePath?: string | null;
  exportOcadVersion?: number;
  mode?: CheckoutMode;
  editOpsJson?: string | null;
};

export async function createCheckout(input: CreateCheckoutInput) {
  return prisma.mapCheckout.create({
    data: {
      mapFileId: input.mapFileId,
      baseVersionId: input.baseVersionId,
      userId: input.userId,
      status: CheckoutStatus.ACTIVE,
      selectionType: input.selectionType,
      selectionJson: serializeSelection(input.selection),
      exportStoragePath: input.exportStoragePath ?? null,
      exportOcadVersion: input.exportOcadVersion ?? 12,
      mode: input.mode ?? CheckoutMode.OCAD_DESKTOP,
      editOpsJson: input.editOpsJson ?? null,
    },
    select: checkoutWithUserSelect,
  });
}

export async function updateCheckoutExportPath(checkoutId: string, exportStoragePath: string) {
  return prisma.mapCheckout.update({
    where: { id: checkoutId },
    data: { exportStoragePath },
    select: checkoutWithUserSelect,
  });
}

export async function updateCheckoutCheckin(
  checkoutId: string,
  checkinStoragePath: string,
  status: CheckoutStatus,
  checkedInById: string,
  integrationComment?: string | null,
) {
  return prisma.mapCheckout.update({
    where: { id: checkoutId },
    data: {
      checkinStoragePath,
      checkedInById,
      status,
      ...(integrationComment !== undefined ? { integrationComment } : {}),
      updatedAt: new Date(),
    },
    select: checkoutWithUserSelect,
  });
}

export async function confirmCheckoutByUser(checkoutId: string) {
  return prisma.mapCheckout.update({
    where: { id: checkoutId },
    data: {
      status: CheckoutStatus.PENDING_ADMIN_CONFIRM,
      userConfirmedAt: new Date(),
    },
    select: checkoutWithUserSelect,
  });
}

export async function updateFieldEditOps(checkoutId: string, editOpsJson: string) {
  return prisma.mapCheckout.update({
    where: { id: checkoutId },
    data: { editOpsJson, updatedAt: new Date() },
    select: checkoutWithUserSelect,
  });
}

export async function findCheckoutHistoryForMap(mapFileId: string, limit = 20) {
  return prisma.mapCheckout.findMany({
    where: {
      mapFileId,
      status: { in: [CheckoutStatus.INTEGRATED, CheckoutStatus.CANCELLED] },
    },
    select: checkoutWithUserSelect,
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
}

export async function findPendingAdminCheckouts() {
  return prisma.mapCheckout.findMany({
    where: { status: CheckoutStatus.PENDING_ADMIN_CONFIRM },
    select: {
      id: true,
      mapFileId: true,
      status: true,
      userConfirmedAt: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true } },
      mapFile: { select: { slug: true, title: true } },
    },
    orderBy: { userConfirmedAt: "asc" },
  });
}

export async function findCheckoutsNeedingReminder(
  initialOlderThan: Date,
  repeatOlderThan: Date,
) {
  return prisma.mapCheckout.findMany({
    where: {
      OR: [
        {
          status: CheckoutStatus.ACTIVE,
          OR: [
            {
              reminderSentAt: null,
              createdAt: { lt: initialOlderThan },
            },
            {
              reminderSentAt: { lt: repeatOlderThan },
            },
          ],
        },
        {
          status: CheckoutStatus.PENDING_ADMIN_CONFIRM,
          userConfirmedAt: { not: null },
          OR: [
            {
              reminderSentAt: null,
              userConfirmedAt: { lt: initialOlderThan },
            },
            {
              reminderSentAt: { lt: repeatOlderThan },
            },
          ],
        },
      ],
    },
    select: checkoutWithUserSelect,
  });
}

export async function markReminderSent(checkoutId: string) {
  return prisma.mapCheckout.update({
    where: { id: checkoutId },
    data: { reminderSentAt: new Date() },
  });
}

export type CancelCheckoutInput = {
  checkoutId: string;
  mapFileId: string;
  cancelledById: string;
  cancelReason?: string | null;
};

const CANCELLABLE_STATUSES: CheckoutStatus[] = [
  CheckoutStatus.ACTIVE,
  CheckoutStatus.CHECKED_IN,
  CheckoutStatus.PENDING_ADMIN_CONFIRM,
];

export async function cancelCheckout(input: CancelCheckoutInput) {
  return prisma.mapCheckout.updateMany({
    where: {
      id: input.checkoutId,
      mapFileId: input.mapFileId,
      status: { in: CANCELLABLE_STATUSES },
    },
    data: {
      status: CheckoutStatus.CANCELLED,
      cancelledAt: new Date(),
      cancelledById: input.cancelledById,
      cancelReason: input.cancelReason ?? null,
    },
  });
}

export function serializeCheckoutResponse(
  checkout: NonNullable<Awaited<ReturnType<typeof getCheckoutById>>>,
) {
  return {
    id: checkout.id,
    mapFileId: checkout.mapFileId,
    baseVersionId: checkout.baseVersionId,
    userId: checkout.userId,
    status: checkout.status,
    selectionType: checkout.selectionType,
    selection: parseSelectionJson(checkout.selectionJson),
    exportStoragePath: checkout.exportStoragePath,
    checkinStoragePath: checkout.checkinStoragePath,
    checkedInById: checkout.checkedInById,
    diffSummaryJson: checkout.diffSummaryJson,
    userConfirmedAt: checkout.userConfirmedAt?.toISOString() ?? null,
    adminConfirmedAt: checkout.adminConfirmedAt?.toISOString() ?? null,
    integratedAt: checkout.integratedAt?.toISOString() ?? null,
    integratedVersionId: checkout.integratedVersionId,
    cancelledAt: checkout.cancelledAt?.toISOString() ?? null,
    cancelledById: checkout.cancelledById,
    cancelReason: checkout.cancelReason,
    integrationComment: checkout.integrationComment,
    reminderSentAt: checkout.reminderSentAt?.toISOString() ?? null,
    exportOcadVersion: checkout.exportOcadVersion,
    mode: checkout.mode,
    editOps: parseFieldEditOps(checkout.editOpsJson),
    createdAt: checkout.createdAt.toISOString(),
    updatedAt: checkout.updatedAt.toISOString(),
    user: {
      id: checkout.user.id,
      name: checkout.user.name,
      email: checkout.user.email,
    },
  };
}
