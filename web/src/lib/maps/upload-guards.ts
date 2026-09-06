import { findActiveAreaLocksForMap } from "@/lib/checkout/repository";
import { canAdmin } from "@/lib/auth/permissions";
import type { Role as RoleType } from "@/lib/roles";

export type UploadGuardOptions = {
  role: RoleType;
  forceDespiteCheckouts?: boolean;
  forceDuplicate?: boolean;
};

export type UploadGuardFailure = {
  ok: false;
  error: string;
  code: "DUPLICATE_CONTENT" | "ACTIVE_CHECKOUTS" | "ACTIVE_CHECKOUTS_ADMIN" | "MAP_ARCHIVED";
  activeCheckoutCount?: number;
};

export async function assertMapAllowsUpload(
  mapFileId: string,
  archivedAt: Date | null,
  role: RoleType,
): Promise<{ ok: true } | UploadGuardFailure> {
  if (archivedAt && !canAdmin(role)) {
    return {
      ok: false,
      error: "Området är arkiverat och kan inte uppdateras.",
      code: "MAP_ARCHIVED",
    };
  }
  return { ok: true };
}

export async function checkVersionUploadGuards(
  mapFileId: string,
  contentHash: string,
  latest: { contentHash: string | null } | null,
  options: UploadGuardOptions,
): Promise<{ ok: true } | UploadGuardFailure> {
  if (latest?.contentHash === contentHash && !options.forceDuplicate) {
    return {
      ok: false,
      error: "Filen har identiskt innehåll som senaste versionen.",
      code: "DUPLICATE_CONTENT",
    };
  }

  const activeCheckouts = await findActiveAreaLocksForMap(mapFileId);
  if (activeCheckouts.length === 0) {
    return { ok: true };
  }

  if (!options.forceDespiteCheckouts) {
    const isAdmin = canAdmin(options.role);
    const lockLabel =
      activeCheckouts.length === 1
        ? "1 aktiv utcheckning eller fältredigering"
        : `${activeCheckouts.length} aktiva utcheckningar eller fältredigeringar`;
    return {
      ok: false,
      error: isAdmin
        ? `Det finns ${lockLabel}. Bekräfta att du vill ladda upp hel karta ändå.`
        : `Det finns ${lockLabel}. Vänta tills de är integrerade eller avbrutna innan du laddar upp en hel karta.`,
      code: isAdmin ? "ACTIVE_CHECKOUTS_ADMIN" : "ACTIVE_CHECKOUTS",
      activeCheckoutCount: activeCheckouts.length,
    };
  }

  return { ok: true };
}
