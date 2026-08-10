import {
  SuggestionCategory,
  type SuggestionCategoryValue,
  SuggestionStatus,
  type SuggestionStatusValue,
  type SuggestionGeometry,
  type SuggestionBboxGeometry,
  type SuggestionPointGeometry,
  type SuggestionPolygonGeometry,
  type SuggestionLineGeometry,
  MAX_OPEN_SUGGESTIONS_PER_USER_PER_MAP,
  MAX_SUGGESTION_ATTACHMENT_BYTES,
  MAX_SUGGESTION_GEOMETRIES,
  SUGGESTION_ATTACHMENT_EXTENSIONS,
} from "@/lib/suggestion/types";
import { isValidSuggestionBbox, isValidSuggestionLineCoordinates, isValidSuggestionPolygonRing } from "@/lib/suggestion/geometry";
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
  const pendingOnUnpublishedVersion =
    !suggestion.mapVersion.isPublished &&
    suggestion.status !== SuggestionStatus.OPEN &&
    suggestion.status !== SuggestionStatus.IN_PROGRESS;
  if (pendingOnUnpublishedVersion) {
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
  if (trimmed.length < 2 || trimmed.length > 2000) return null;
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
  const intent = record.intent;
  if (intent != null && intent !== "delete") return null;
  return {
    type: "Point",
    coordinates: [x, y],
    ...(intent === "delete" ? { intent: "delete" as const } : {}),
  };
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

function validatePolygonGeometry(record: Record<string, unknown>): SuggestionPolygonGeometry | null {
  if (record.type !== "Polygon" || !Array.isArray(record.ring)) return null;
  const ring: [number, number][] = [];
  for (const pt of record.ring) {
    if (!Array.isArray(pt) || pt.length !== 2) return null;
    const [x, y] = pt;
    if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }
    ring.push([x, y]);
  }
  if (!isValidSuggestionPolygonRing(ring)) return null;
  return { type: "Polygon", ring };
}

function validateLineGeometry(record: Record<string, unknown>): SuggestionLineGeometry | null {
  if (record.type !== "LineString" || !Array.isArray(record.coordinates)) return null;
  const coordinates: [number, number][] = [];
  for (const pt of record.coordinates) {
    if (!Array.isArray(pt) || pt.length !== 2) return null;
    const [x, y] = pt;
    if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }
    coordinates.push([x, y]);
  }
  if (!isValidSuggestionLineCoordinates(coordinates)) return null;
  return { type: "LineString", coordinates };
}

export function validateSuggestionGeometry(value: unknown): SuggestionGeometry | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.type === "Point") return validatePointGeometry(record);
  if (record.type === "Bbox") return validateBboxGeometry(record);
  if (record.type === "Polygon") return validatePolygonGeometry(record);
  if (record.type === "LineString") return validateLineGeometry(record);
  return null;
}

export function validateSuggestionGeometries(value: unknown): SuggestionGeometry[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length < 1 || value.length > MAX_SUGGESTION_GEOMETRIES) return null;
  const geometries: SuggestionGeometry[] = [];
  for (const item of value) {
    const geometry = validateSuggestionGeometry(item);
    if (!geometry) return null;
    geometries.push(geometry);
  }
  return geometries;
}

/** Accepts `geometries` array or legacy single `geometry`. */
export function parseSuggestionGeometriesFromRecord(
  record: Record<string, unknown>,
): SuggestionGeometry[] | null {
  if (record.geometries != null) {
    return validateSuggestionGeometries(record.geometries);
  }
  if (record.geometry != null) {
    const geometry = validateSuggestionGeometry(record.geometry);
    return geometry ? [geometry] : null;
  }
  return null;
}

export function suggestionObjectTypeForGeometry(
  geometry: SuggestionGeometry,
): "POINT" | "BBOX" | "POLYGON" | "LINE" {
  switch (geometry.type) {
    case "Point":
      return "POINT";
    case "Bbox":
      return "BBOX";
    case "Polygon":
      return "POLYGON";
    case "LineString":
      return "LINE";
  }
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
