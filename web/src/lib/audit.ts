import { prisma } from "@/lib/prisma";

export type AuditAction =
  | "LOGIN"
  | "UPLOAD"
  | "DOWNLOAD"
  | "EXPORT_OCD"
  | "ROLE_CHANGE"
  | "MAP_CREATE"
  | "COMPARE";

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
    },
  });
}
