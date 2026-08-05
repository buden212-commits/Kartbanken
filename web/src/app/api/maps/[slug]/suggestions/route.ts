import { requireSession } from "@/lib/auth/api";
import { logAction } from "@/lib/audit";
import {
  assertOpenSuggestionQuota,
  assertSuggestionCreateAccess,
  validateSuggestionCategory,
  validateSuggestionComment,
  validateSuggestionGeometry,
  validateSuggestionTitle,
} from "@/lib/suggestion/access";
import {
  countOpenSuggestionsForUser,
  createSuggestion,
  listSuggestionsForMap,
  serializeSuggestionDetail,
  serializeSuggestionSummary,
} from "@/lib/suggestion/repository";
import { SUGGESTION_CATEGORY_LABELS } from "@/lib/suggestion/types";
import { queueNotifyNewMapSuggestion } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ slug: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const denied = assertSuggestionCreateAccess(session);
  if (denied) return denied;

  const { slug } = await params;
  const map = await prisma.mapFile.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!map) {
    return NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? undefined;

  const suggestions = await listSuggestionsForMap(map.id, status);
  return NextResponse.json({
    suggestions: suggestions.map(serializeSuggestionSummary),
  });
}

export async function POST(request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const denied = assertSuggestionCreateAccess(session);
  if (denied) return denied;

  const { slug } = await params;
  const map = await prisma.mapFile.findUnique({
    where: { slug },
    select: { id: true, title: true, slug: true },
  });
  if (!map) {
    return NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ogiltig JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Ogiltig begäran" }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const mapVersionId = typeof record.mapVersionId === "string" ? record.mapVersionId : null;
  const category = validateSuggestionCategory(record.category);
  const comment = validateSuggestionComment(record.comment);
  const title = validateSuggestionTitle(record.title);
  const geometry = validateSuggestionGeometry(record.geometry);

  if (!mapVersionId) {
    return NextResponse.json({ error: "Kartversion krävs" }, { status: 400 });
  }
  if (!category) {
    return NextResponse.json({ error: "Ogiltig kategori" }, { status: 400 });
  }
  if (!comment) {
    return NextResponse.json(
      { error: "Kommentar krävs (minst 10 tecken)" },
      { status: 400 },
    );
  }
  if (!geometry) {
    return NextResponse.json({ error: "Ogiltig markering på kartan" }, { status: 400 });
  }

  const version = await prisma.mapVersion.findFirst({
    where: { id: mapVersionId, mapFileId: map.id },
    select: { id: true, versionNumber: true, isPublished: true },
  });
  if (!version) {
    return NextResponse.json({ error: "Version hittades inte" }, { status: 404 });
  }
  if (!version.isPublished) {
    return NextResponse.json(
      { error: "Kartförslag kan bara skapas på publicerade versioner" },
      { status: 400 },
    );
  }

  const quotaDenied = await assertOpenSuggestionQuota(
    map.id,
    session.user.id,
    countOpenSuggestionsForUser,
  );
  if (quotaDenied) return quotaDenied;

  const suggestion = await createSuggestion({
    mapFileId: map.id,
    mapVersionId: version.id,
    createdById: session.user.id,
    category,
    title,
    comment,
    geometryJson: JSON.stringify(geometry),
  });

  await logAction(session.user.id, "SUGGESTION_CREATED", "MapSuggestion", suggestion.id, {
    mapSlug: slug,
    versionNumber: version.versionNumber,
    category,
    categoryLabel: SUGGESTION_CATEGORY_LABELS[category],
  });

  queueNotifyNewMapSuggestion({
    mapTitle: map.title,
    mapSlug: map.slug,
    suggestionId: suggestion.id,
    versionNumber: version.versionNumber,
    categoryLabel: SUGGESTION_CATEGORY_LABELS[category],
    comment,
    authorName: session.user.name ?? null,
    authorEmail: session.user.email ?? "",
  });

  return NextResponse.json(serializeSuggestionDetail(suggestion), { status: 201 });
}
