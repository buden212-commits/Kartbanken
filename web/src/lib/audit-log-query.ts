import { formatAuditActivity } from "@/lib/audit-labels";
import { prisma } from "@/lib/prisma";

export type AuditLogSortField = "name" | "activity" | "date";
export type AuditLogSortDir = "asc" | "desc";

export type AuditLogRow = {
  id: string;
  userId: string | null;
  userName: string;
  activity: string;
  createdAt: string;
};

export type AuditLogUserOption = {
  id: string;
  label: string;
};

const LOG_LIMIT = 1000;

function displayUserName(name: string | null | undefined, email: string | null | undefined): string {
  return name?.trim() || email?.trim() || "—";
}

function compareStrings(a: string, b: string, dir: AuditLogSortDir): number {
  const result = a.localeCompare(b, "sv", { sensitivity: "base" });
  return dir === "asc" ? result : -result;
}

function compareDates(a: string, b: string, dir: AuditLogSortDir): number {
  const result = new Date(a).getTime() - new Date(b).getTime();
  return dir === "asc" ? result : -result;
}

export async function listAuditLogUsers(): Promise<AuditLogUserOption[]> {
  const userIds = await prisma.auditLog.findMany({
    where: { userId: { not: null } },
    distinct: ["userId"],
    select: { userId: true },
  });

  const ids = userIds.map((row) => row.userId).filter((id): id is string => Boolean(id));
  if (ids.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, email: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });

  return users.map((user) => ({
    id: user.id,
    label: displayUserName(user.name, user.email),
  }));
}

export async function listAuditLogs(params: {
  userId?: string;
  sort: AuditLogSortField;
  dir: AuditLogSortDir;
}): Promise<{ rows: AuditLogRow[]; truncated: boolean }> {
  const where =
    params.userId === "__system"
      ? { userId: null }
      : params.userId
        ? { userId: params.userId }
        : {};

  const dbOrderBy =
    params.sort === "date"
      ? { createdAt: params.dir }
      : params.sort === "activity"
        ? { action: params.dir }
        : { createdAt: "desc" as const };

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: dbOrderBy,
    take: LOG_LIMIT + 1,
    select: {
      id: true,
      userId: true,
      action: true,
      metadata: true,
      createdAt: true,
    },
  });

  const truncated = logs.length > LOG_LIMIT;
  const slice = truncated ? logs.slice(0, LOG_LIMIT) : logs;

  const userIds = [...new Set(slice.map((log) => log.userId).filter(Boolean))] as string[];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const userMap = new Map(users.map((user) => [user.id, user]));

  let rows: AuditLogRow[] = slice.map((log) => {
    const user = log.userId ? userMap.get(log.userId) : null;
    return {
      id: log.id,
      userId: log.userId,
      userName: user ? displayUserName(user.name, user.email) : "System",
      activity: formatAuditActivity(log.action, log.metadata),
      createdAt: log.createdAt.toISOString(),
    };
  });

  if (params.sort === "name") {
    rows = [...rows].sort((a, b) => compareStrings(a.userName, b.userName, params.dir));
  } else if (params.sort === "activity") {
    rows = [...rows].sort((a, b) => compareStrings(a.activity, b.activity, params.dir));
  } else if (params.sort === "date" && params.dir === "asc") {
    rows = [...rows].sort((a, b) => compareDates(a.createdAt, b.createdAt, "asc"));
  }

  return { rows, truncated };
}
