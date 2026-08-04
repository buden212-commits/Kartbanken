import { prisma } from "@/lib/prisma";

export type AuditAction =
  | "LOGIN"
  | "USER_UPDATED"
  | "UPLOAD"
  | "DOWNLOAD"
  | "EXPORT_OCD"
  | "ROLE_CHANGE"
  | "MAP_CREATE"
  | "MAP_RENAMED"
  | "MAP_DELETED"
  | "VERSION_DELETED"
  | "COMPARE"
  | "VERSION_PUBLISH"
  | "CHECKOUT_CREATED"
  | "CHECKIN_SUBMITTED"
  | "CHECKOUT_USER_CONFIRMED"
  | "CHECKOUT_INTEGRATED"
  | "CHECKOUT_CANCELLED"
  | "CHECKOUT_REMINDER_SENT"
  | "COURSE_CREATED"
  | "COURSE_UPDATED"
  | "COURSE_DELETED"
  | "COURSE_PDF_EXPORT";

export async function logAction(
  userId: string | null | undefined,
  action: AuditAction,
  targetType?: string,
  targetId?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId: userId ?? null,
      action,
      targetType,
      targetId,
      metadata: metadata ? JSON.stringify(metadata) : null,
      createdAt: new Date(),
    },
  });
}
