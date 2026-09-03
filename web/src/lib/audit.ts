import { prisma } from "@/lib/prisma";

export type AuditAction =
  | "LOGIN"
  | "LOGIN_FAILED"
  | "USER_CREATED"
  | "USER_UPDATED"
  | "USER_DELETED"
  | "USER_NOTIFICATIONS_UPDATED"
  | "SETTINGS_UPDATED"
  | "TEST_EMAIL_SENT"
  | "UPLOAD"
  | "DOWNLOAD"
  | "EXPORT_OCD"
  | "ROLE_CHANGE"
  | "MAP_CREATE"
  | "MAP_RENAMED"
  | "MAP_ARCHIVED"
  | "MAP_UNARCHIVED"
  | "MAP_DELETED"
  | "VERSION_DELETED"
  | "COMPARE"
  | "DIFF_EXPORT_PDF"
  | "VERSION_PUBLISH"
  | "VERSION_RECOMMENDED"
  | "CHECKOUT_CREATED"
  | "CHECKIN_SUBMITTED"
  | "CHECKOUT_USER_CONFIRMED"
  | "CHECKOUT_INTEGRATED"
  | "CHECKOUT_CANCELLED"
  | "CHECKOUT_REMINDER_SENT"
  | "FIELD_EDIT_CREATED"
  | "FIELD_EDIT_PUBLISHED"
  | "FIELD_EDIT_SUBMITTED"
  | "FIELD_EDIT_CANCELLED"
  | "COURSE_CREATED"
  | "COURSE_UPDATED"
  | "COURSE_DELETED"
  | "COURSE_PDF_EXPORT"
  | "EMAIL_SENT"
  | "PASSWORD_RESET_REQUESTED"
  | "PASSWORD_CHANGED"
  | "SUGGESTION_CREATED"
  | "SUGGESTION_UPDATED"
  | "SUGGESTION_REVIEWED"
  | "SUGGESTION_DELETED"
  | "SUGGESTION_REPORT_EXPORT"
  | "MAP_GEOTIFF_EXPORT"
  | "FEEDBACK_CREATED"
  | "FEEDBACK_REVIEWED"
  | "FEEDBACK_VOTED";

export type EmailSentAuditMetadata = {
  kind: "checkin" | "new_upload" | "test";
  subject: string;
  withAttachment: boolean;
  attachmentFilename?: string;
  attachmentError?: string;
  recipientsWithAttachment: string[];
  recipientsWithoutAttachment: string[];
  mapSlug?: string;
  mapTitle?: string;
  versionNumber?: number;
};

export async function logEmailSent(
  metadata: EmailSentAuditMetadata,
  options?: {
    userId?: string | null;
    targetType?: string;
    targetId?: string;
  },
): Promise<void> {
  await logAction(options?.userId ?? null, "EMAIL_SENT", options?.targetType, options?.targetId, {
    ...metadata,
  });
}

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
