import {
  SuggestionCategory,
  type SuggestionCategoryValue,
  SuggestionStatus,
  type SuggestionStatusValue,
  type SuggestionGeometry,
  type SuggestionBboxGeometry,
  type SuggestionPointGeometry,
  MAX_OPEN_SUGGESTIONS_PER_USER_PER_MAP,
  MAX_SUGGESTION_ATTACHMENT_BYTES,
  SUGGESTION_ATTACHMENT_EXTENSIONS,
} from "@/lib/suggestion/types";
import { isValidSuggestionBbox } from "@/lib/suggestion/geometry";
import {
  canCreateMapSuggestion,
  canReviewMapSuggestion,
} from "@/lib/auth/permissions";
import type { AuthSession } from "@/lib/auth/api";
import { NextResponse } from "next/server";

type SuggestionRecord = {
  id: string;
  mapFileId: string;
  mapVersionId: string;
  createdById: string;
  status: string;
  mapVersion: { isPublished: boolean; versionNumber: number };
};

export function assertSuggestionViewAccess(
  session: AuthSession,
  suggestion: SuggestionRecord,
): NextResponse | null {
  if (!canCreateMapSuggestion(session.user.role)) {
    return NextResponse.json({ error: "Ingen behörighet" }, { status: 403 });
  }
  if (!suggestion.mapVersion.isPublished) {
    return NextResponse.json({ error: "Förslaget hittades inte" }, { status: 404 });
  }
  return null;
}

export function assertSuggestionCreateAccess(session: AuthSession): NextResponse | null {
  if (!canCreateMapSuggestion(session.user.role)) {
    return NextResponse.json({ error: "Ingen behörighet att skapa kartförslag" }, { status: 403 });
  }
  return null;
}

export function assertSuggestionEditAccess(
  session: AuthSession,
  suggestion: Pick<SuggestionRecord, "createdById" | "status">,
): NextResponse | null {
  if (suggestion.status !== SuggestionStatus.OPEN) {
    return NextResponse.json({ error: "Endast öppna förslag kan redigeras" }, { status: 400 });
  }
  if (suggestion.createdById !== session.user.id) {
    return NextResponse.json({ error: "Ingen behörighet att redigera förslaget" }, { status: 403 });
  }
  return null;
}

export function assertSuggestionReviewAccess(session: AuthSession): NextResponse | null {
  if (!canReviewMapSuggestion(session.user.role)) {
    return NextResponse.json({ error: "Ingen behörighet att granska förslag" }, { status: 403 });
  }
  return null;
}

export function validateSuggestionCategory(value: unknown): SuggestionCategoryValue | null {
  if (typeof value !== "string") return null;
  return (Object.values(SuggestionCategory) as string[]).includes(value)
    ? (value as SuggestionCategoryValue)
    : null;
}

export function validateSuggestionStatus(value: unknown): SuggestionStatusValue | null {
  if (typeof value !== "string") return null;
  return (Object.values(SuggestionStatus) as string[]).includes(value)
    ? (value as SuggestionStatusValue)
    : null;
}

/** Status values editors may set during review (not OPEN). */
export function validateSuggestionReviewStatus(value: unknown): SuggestionStatusValue | null {
  const status = validateSuggestionStatus(value);
  if (!status || status === SuggestionStatus.OPEN) return null;
  return status;
}

export function validateSuggestionComment(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length < 10 || trimmed.length > 2000) return null;
  return trimmed;
}

export function validateSuggestionTitle(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 120) return null;
  return trimmed;
}

function validatePointGeometry(record: Record<string, unknown>): SuggestionPointGeometry | null {
  if (record.type !== "Point" || !Array.isArray(record.coordinates)) return null;
  if (record.coordinates.length !== 2) return null;
  const [x, y] = record.coordinates;
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return { type: "Point", coordinates: [x, y] };
}

function validateBboxGeometry(record: Record<string, unknown>): SuggestionBboxGeometry | null {
  if (record.type !== "Bbox" || !record.bbox || typeof record.bbox !== "object") return null;
  const bbox = record.bbox as Record<string, unknown>;
  const minX = Number(bbox.minX);
  const minY = Number(bbox.minY);
  const maxX = Number(bbox.maxX);
  const maxY = Number(bbox.maxY);
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
  const normalized = { minX, minY, maxX, maxY };
  if (!isValidSuggestionBbox(normalized)) return null;
  return { type: "Bbox", bbox: normalized };
}

export function validateSuggestionGeometry(value: unknown): SuggestionGeometry | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.type === "Point") return validatePointGeometry(record);
  if (record.type === "Bbox") return validateBboxGeometry(record);
  return null;
}

export function suggestionObjectTypeForGeometry(
  geometry: SuggestionGeometry,
): "POINT" | "BBOX" {
  return geometry.type === "Point" ? "POINT" : "BBOX";
}

export function validateSuggestionAttachmentFilename(
  filename: string,
  sizeBytes: number,
): { ok: true } | { ok: false; error: string } {
  const lower = filename.toLowerCase();
  const allowed = SUGGESTION_ATTACHMENT_EXTENSIONS.some((ext) => lower.endsWith(ext));
  if (!allowed) {
    return { ok: false, error: "Endast JPG, PNG och WebP tillåts som foto." };
  }
  if (sizeBytes > MAX_SUGGESTION_ATTACHMENT_BYTES) {
    return {
      ok: false,
      error: `Bilden är för stor (max ${Math.round(MAX_SUGGESTION_ATTACHMENT_BYTES / 1_048_576)} MB).`,
    };
  }
  if (sizeBytes === 0) {
    return { ok: false, error: "Filen är tom." };
  }
  return { ok: true };
}

export async function assertOpenSuggestionQuota(
  mapFileId: string,
  userId: string,
  countOpen: (mapFileId: string, userId: string) => Promise<number>,
): Promise<NextResponse | null> {
  const openCount = await countOpen(mapFileId, userId);
  if (openCount >= MAX_OPEN_SUGGESTIONS_PER_USER_PER_MAP) {
    return NextResponse.json(
      {
        error: `Du har redan ${MAX_OPEN_SUGGESTIONS_PER_USER_PER_MAP} öppna förslag på detta område. Vänta på granskning eller avsluta befintliga.`,
      },
      { status: 400 },
    );
  }
  return null;
}
