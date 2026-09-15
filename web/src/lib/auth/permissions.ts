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

export function canCheckout(role: RoleType): boolean {
  return role === Role.EDITOR || role === Role.ADMIN;
}

export function canViewCheckouts(role: RoleType): boolean {
  return role === Role.EDITOR || role === Role.ADMIN;
}

/** Läsare får e-postnotiser men inte .ocd-bilaga. */
export function canReceiveOcdAttachment(role: RoleType): boolean {
  return role === Role.EDITOR || role === Role.ADMIN;
}

export function canCancelCheckout(role: RoleType): boolean {
  return role === Role.ADMIN;
}

export function canCheckin(role: RoleType): boolean {
  return role === Role.EDITOR || role === Role.ADMIN;
}

export function canConfirmCheckoutIntegration(
  role: RoleType,
  checkoutUserId: string,
  sessionUserId: string,
): boolean {
  if (role === Role.ADMIN) return true;
  return role === Role.EDITOR && checkoutUserId === sessionUserId;
}

export function canAdminConfirmIntegration(role: RoleType): boolean {
  return role === Role.ADMIN;
}

/** In-browser field editing (OCAD light). Admins always; others when granted by admin. */
export function canFieldEdit(
  role: RoleType,
  granted?: boolean,
): boolean {
  if (!canDownload(role)) return false;
  return role === Role.ADMIN || granted === true;
}

export type FieldEditCapableUser = {
  role: RoleType;
  canFieldEdit?: boolean;
};

export function userCanFieldEdit(user: FieldEditCapableUser): boolean {
  return canFieldEdit(user.role, user.canFieldEdit);
}

/** All approved users (Reader+) can create courses (COURSE-16). */
export function canCreateCourse(role: RoleType): boolean {
  return canDownload(role);
}

export function canCreateMapSuggestion(role: RoleType): boolean {
  return canDownload(role);
}

export function canReviewMapSuggestion(role: RoleType): boolean {
  return canUpload(role);
}

export function canEditCourse(
  role: RoleType,
  courseOwnerId: string,
  sessionUserId: string,
): boolean {
  if (role === Role.ADMIN) return true;
  return courseOwnerId === sessionUserId;
}

export function canViewCourse(
  role: RoleType,
  course: { isPublic: boolean; createdById: string },
  sessionUserId: string,
): boolean {
  if (!canDownload(role)) return false;
  if (course.isPublic) return true;
  return course.createdById === sessionUserId;
}

export function canDeleteCourse(
  role: RoleType,
  courseOwnerId: string,
  sessionUserId: string,
): boolean {
  return canEditCourse(role, courseOwnerId, sessionUserId);
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

export function roleDescription(role: RoleType): string {
  switch (role) {
    case Role.ADMIN:
      return "Allt redaktör kan, plus skapa områden, redigera områdesnamn, radera områden, godkänna konton, avbryta utcheckningar, integrera incheckningar, tilldela fältredigering och hantera systeminställningar.";
    case Role.EDITOR:
      return "Allt läsare kan, plus ladda upp versioner, publicera/avpublicera, se opublicerade versioner och checka ut/in områden för OCAD-redigering.";
    case Role.READER:
      return "Visa publicerade kartversioner, skapa kartförslag och egna banor. Ser bara områden med publicerad karta — inga utcheckningar.";
    default:
      return "";
  }
}
