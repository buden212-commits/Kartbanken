import { logAction } from "@/lib/audit";
import { updateCheckoutCheckin } from "./repository";
import { CHECKIN_ALLOWED_STATUSES, CheckoutStatus } from "./types";
import { notifyCheckinSubmitted } from "@/lib/email";
import {
  ocadVersionLabel,
  readOcadFileInfo,
  type OcadFileInfo,
} from "@/lib/ocad/ocad-file-info";
import { prisma } from "@/lib/prisma";
import { deleteFile, readStoredFile } from "@/lib/storage";

/** Real-world offset tolerance (m) when comparing georeferencing of checkin vs base map. */
const GEOREF_OFFSET_TOLERANCE_M = 0.5;

export function checkinStatusAllowsUpload(status: string): boolean {
  return CHECKIN_ALLOWED_STATUSES.includes(status as CheckoutStatus);
}

/**
 * Validates a checked-in OCAD file against the base map it will be merged into.
 * Returns an error message (Swedish, user-facing) or null when the file is acceptable.
 */
export function validateCheckinFileInfo(
  checkin: OcadFileInfo,
  reference: OcadFileInfo | null,
): string | null {
  if (checkin.objectFormat == null) {
    return `OCAD-version ${ocadVersionLabel(checkin.version)} stöds inte. Spara filen i OCAD 10, 11, 12 eller 2018 och senare.`;
  }
  if (checkin.activeObjects === 0) {
    return "Filen innehåller inga objekt. Kontrollera att du laddar upp den sparade utcheckningsfilen.";
  }
  if (!reference) return null;

  if (reference.objectFormat != null && checkin.objectFormat !== reference.objectFormat) {
    return (
      `Filen är sparad i OCAD ${ocadVersionLabel(checkin.version)} men grundkartan är i OCAD ${ocadVersionLabel(reference.version)}. ` +
      "Objektformaten skiljer sig, så ändringarna kan inte föras över automatiskt. Spara filen i samma OCAD-version som utcheckningen och checka in igen."
    );
  }

  const a = checkin.scaleParams;
  const b = reference.scaleParams;
  if (a && b) {
    if (a.scale > 0 && b.scale > 0 && a.scale !== b.scale) {
      return `Filens skala (1:${a.scale}) skiljer sig från grundkartans (1:${b.scale}). Ändra inte kartans skala i utcheckningen.`;
    }
    if (
      Math.abs(a.offsetX - b.offsetX) > GEOREF_OFFSET_TOLERANCE_M ||
      Math.abs(a.offsetY - b.offsetY) > GEOREF_OFFSET_TOLERANCE_M ||
      Math.abs(a.angle - b.angle) > 1e-6
    ) {
      return "Filens georeferering (förskjutning eller vridning) skiljer sig från grundkartans. Ändra inte georefereringen i utcheckningen.";
    }
  }

  return null;
}

export async function validateCheckinBuffer(
  checkinBuffer: Buffer,
  baseVersionStoragePath: string,
): Promise<string | null> {
  let checkinInfo: OcadFileInfo;
  try {
    checkinInfo = readOcadFileInfo(checkinBuffer);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "okänt fel";
    return `Filen kunde inte läsas som en OCAD-fil (${reason}).`;
  }

  let referenceInfo: OcadFileInfo | null = null;
  try {
    referenceInfo = readOcadFileInfo(await readStoredFile(baseVersionStoragePath));
  } catch (err) {
    console.warn("[checkin] could not read base version for validation", err);
  }

  return validateCheckinFileInfo(checkinInfo, referenceInfo);
}

export type SubmitCheckinInput = {
  checkout: {
    id: string;
    baseVersionId: string;
    checkinStoragePath: string | null;
    user: { name: string | null; email: string };
  };
  map: { id: string; title: string; slug: string };
  newStoragePath: string;
  buffer: Buffer;
  userId: string;
  comment: string | null | undefined;
  filename: string;
  via: "form" | "blob";
};

export type SubmitCheckinResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * Validates and registers an uploaded checkin file. The status update is conditional
 * (ACTIVE/CHECKED_IN only) so integrated, cancelled or integrating checkouts can never
 * be reopened. The previous checkin file is removed only after the DB points elsewhere.
 * On failure the new file is deleted.
 */
export async function submitCheckin(input: SubmitCheckinInput): Promise<SubmitCheckinResult> {
  const reject = async (status: number, error: string): Promise<SubmitCheckinResult> => {
    if (input.newStoragePath !== input.checkout.checkinStoragePath) {
      await deleteFile(input.newStoragePath).catch(() => undefined);
    }
    return { ok: false, status, error };
  };

  const baseVersion = await prisma.mapVersion.findUnique({
    where: { id: input.checkout.baseVersionId },
    select: { storagePath: true },
  });
  if (!baseVersion) {
    return reject(409, "Utcheckningens grundversion finns inte längre.");
  }

  const validationError = await validateCheckinBuffer(input.buffer, baseVersion.storagePath);
  if (validationError) {
    return reject(400, validationError);
  }

  const updated = await updateCheckoutCheckin(
    input.checkout.id,
    input.newStoragePath,
    input.userId,
    input.comment,
  );
  if (!updated) {
    return reject(409, "Utcheckningen accepterar inte incheckning i nuvarande status.");
  }

  const previous = input.checkout.checkinStoragePath;
  if (previous && previous !== input.newStoragePath) {
    await deleteFile(previous).catch(() => undefined);
  }

  await logAction(input.userId, "CHECKIN_SUBMITTED", "MapCheckout", input.checkout.id, {
    mapSlug: input.map.slug,
    filename: input.filename,
    via: input.via,
  });

  notifyCheckinSubmitted({
    checkoutId: input.checkout.id,
    map: { title: input.map.title, slug: input.map.slug },
    owner: { name: input.checkout.user.name, email: input.checkout.user.email },
    checkin: { storagePath: input.newStoragePath, filename: input.filename },
  });

  return { ok: true };
}
