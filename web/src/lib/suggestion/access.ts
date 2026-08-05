import {
  SuggestionCategory,
  type SuggestionCategoryValue,
  SuggestionStatus,
  type SuggestionStatusValue,
  type SuggestionGeometry,
  MAX_OPEN_SUGGESTIONS_PER_USER_PER_MAP,
} from "@/lib/suggestion/types";
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

export function validateSuggestionGeometry(value: unknown): SuggestionGeometry | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { type?: string; coordinates?: unknown };
  if (record.type !== "Point" || !Array.isArray(record.coordinates)) return null;
  if (record.coordinates.length !== 2) return null;
  const [x, y] = record.coordinates;
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return { type: "Point", coordinates: [x, y] };
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
