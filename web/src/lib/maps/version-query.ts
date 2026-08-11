import type { Prisma } from "@prisma/client";
import type { Role as RoleType } from "@/lib/roles";
import { canUpload } from "@/lib/auth/permissions";
import { isReader } from "@/lib/auth/version-access";

/** Prisma filter: readers only see published versions in lists. */
export function versionVisibilityFilter(role: RoleType | undefined) {
  if (!role || canUpload(role)) return {};
  return { isPublished: true };
}

/** Områdeslista: läsare ser bara områden med minst en publicerad version. */
export function mapListWhereForRole(
  role: RoleType | undefined,
  isAdmin: boolean,
): Prisma.MapFileWhereInput {
  const where: Prisma.MapFileWhereInput = {};
  if (!isAdmin) {
    where.archivedAt = null;
  }
  if (role && isReader(role)) {
    where.versions = { some: { isPublished: true } };
  }
  return where;
}
