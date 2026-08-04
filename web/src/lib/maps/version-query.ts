import type { Role as RoleType } from "@/lib/roles";
import { canUpload } from "@/lib/auth/permissions";

/** Prisma filter: readers only see published versions in lists. */
export function versionVisibilityFilter(role: RoleType | undefined) {
  if (!role || canUpload(role)) return {};
  return { isPublished: true };
}
