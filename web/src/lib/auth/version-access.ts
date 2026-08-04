import { canUpload } from "@/lib/auth/permissions";
import type { Role as RoleType } from "@/lib/roles";
import { Role } from "@/lib/roles";

export function canManagePublication(role: RoleType): boolean {
  return canUpload(role);
}

/** Editors/admins see all versions; readers only published ones. */
export function canViewVersion(role: RoleType, isPublished: boolean): boolean {
  if (canUpload(role)) return true;
  return role === Role.READER && isPublished;
}

export function isReader(role: RoleType): boolean {
  return role === Role.READER;
}

export function publicationLabel(isPublished: boolean): string {
  return isPublished ? "Publicerad" : "Ej publicerad";
}
