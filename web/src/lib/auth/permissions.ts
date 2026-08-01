import { Role, type Role as RoleType } from "@/lib/roles";

export function canDownload(role: RoleType): boolean {
  return role === Role.READER || role === Role.EDITOR || role === Role.ADMIN;
}

export function canUpload(role: RoleType): boolean {
  return role === Role.EDITOR || role === Role.ADMIN;
}

export function canAdmin(role: RoleType): boolean {
  return role === Role.ADMIN;
}

export function isApproved(role: RoleType): boolean {
  return canDownload(role);
}

export function roleLabel(role: RoleType): string {
  switch (role) {
    case Role.ADMIN:
      return "Administratör";
    case Role.EDITOR:
      return "Redaktör";
    case Role.READER:
      return "Läsare";
    case Role.PENDING:
      return "Väntar på godkännande";
    case Role.REJECTED:
      return "Avvisad";
    default:
      return role;
  }
}
