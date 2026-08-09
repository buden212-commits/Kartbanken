import { requireSession } from "@/lib/auth/api";
import { logAction } from "@/lib/audit";
import {
  assertOpenSuggestionQuota,
  assertSuggestionCreateAccess,
  parseSuggestionGeometriesFromRecord,
  validateSuggestionCategory,
  validateSuggestionComment,
  validateSuggestionGeometries,
  validateSuggestionTitle,
  validateSuggestionAttachmentFilename,
} from "@/lib/suggestion/access";
import {
  countOpenSuggestionsForUser,
  createSuggestion,
  getLatestPublishedVersionNumber,
  listSuggestionOverlaysForVersion,
  listPendingSuggestionOverlaysForMap,
  listSuggestionsForMap,
  serializeSuggestionDetail,
  serializeSuggestionSummary,
} from "@/lib/suggestion/repository";
import { SUGGESTION_CATEGORY_LABELS } from "@/lib/suggestion/types";
import { queueNotifyNewMapSuggestion } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import {
  buildSuggestionAttachmentPath,
  deleteFile,
  fileExists,
  shouldUseClientUpload,
  uploadFile,
} from "@/lib/storage";
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
  const overlay = url.searchParams.get("overlay") === "1" || url.searchParams.get("overlay") === "true";
  const mapVersionId = url.searchParams.get("mapVersionId") ?? undefined;

  if (overlay) {
    if (mapVersionId) {
      const version = await prisma.mapVersion.findFirst({
        where: { id: mapVersionId, mapFileId: map.id, isPublished: true },
        select: { id: true },
      });
      if (!version) {
        return NextResponse.json({ error: "Version hittades inte" }, { status: 404 });
      }
      const items = await listSuggestionOverlaysForVersion(map.id, version.id);
      return NextResponse.json({
        overlays: items.map((item) => ({
          id: item.id,
          status: item.status,
          categoryLabel: SUGGESTION_CATEGORY_LABELS[item.category],
          geometry: item.geometry,
        })),
      });
    }

    const items = await listPendingSuggestionOverlaysForMap(map.id);
    return NextResponse.json({
      overlays: items.map((item) => ({
        id: item.id,
        status: item.status,
        categoryLabel: SUGGESTION_CATEGORY_LABELS[item.category],
        geometry: item.geometry,
      })),
    });
  }

  const [suggestions, latestPublishedVersionNumber] = await Promise.all([
    listSuggestionsForMap(map.id, status),
    getLatestPublishedVersionNumber(map.id),
  ]);

  return NextResponse.json({
    suggestions: suggestions.map((s) =>
      serializeSuggestionSummary(s, latestPublishedVersionNumber),
    ),
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

  const contentType = request.headers.get("content-type") ?? "";
  let mapVersionId: string | null = null;
  let category: ReturnType<typeof validateSuggestionCategory> = null;
  let comment: ReturnType<typeof validateSuggestionComment> = null;
  let title: ReturnType<typeof validateSuggestionTitle> = null;
  let geometries: ReturnType<typeof validateSuggestionGeometries> = null;
  let attachmentPath: string | null = null;

  if (contentType.includes("multipart/form-data")) {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: "Ogiltig uppladdning" }, { status: 400 });
    }

    mapVersionId = formData.get("mapVersionId")?.toString() ?? null;
    category = validateSuggestionCategory(formData.get("category"));
    comment = validateSuggestionComment(formData.get("comment"));
    title = validateSuggestionTitle(formData.get("title"));
    try {
      const geometriesRaw = formData.get("geometries")?.toString();
      if (geometriesRaw) {
        geometries = validateSuggestionGeometries(JSON.parse(geometriesRaw));
      } else {
        const geometryRaw = formData.get("geometry")?.toString();
        geometries = geometryRaw
          ? validateSuggestionGeometries([JSON.parse(geometryRaw)])
          : null;
      }
    } catch {
      geometries = null;
    }

    const file = formData.get("attachment");
    if (file instanceof File && file.size > 0) {
      const validation = validateSuggestionAttachmentFilename(file.name, file.size);
      if (!validation.ok) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
      if (shouldUseClientUpload(file.size)) {
        return NextResponse.json(
          {
            error: "Bilden är för stor för direktuppladdning. Minska filstorleken.",
            clientUploadRequired: true,
          },
          { status: 413 },
        );
      }
      const storagePath = buildSuggestionAttachmentPath(map.id, file.name);
      const buffer = Buffer.from(await file.arrayBuffer());
      try {
        attachmentPath = await uploadFile(storagePath, buffer);
      } catch (err) {
        console.error("Suggestion attachment upload failed:", err);
        return NextResponse.json({ error: "Kunde inte ladda upp bilden" }, { status: 500 });
      }
    }
  } else {
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
    mapVersionId = typeof record.mapVersionId === "string" ? record.mapVersionId : null;
    category = validateSuggestionCategory(record.category);
    comment = validateSuggestionComment(record.comment);
    title = validateSuggestionTitle(record.title);
    geometries = parseSuggestionGeometriesFromRecord(record);

    if (typeof record.attachmentPath === "string" && record.attachmentPath.trim()) {
      const candidate = record.attachmentPath.trim();
      const prefix = `maps/${map.id}/suggestion-attachments/`;
      if (!candidate.includes(prefix)) {
        return NextResponse.json({ error: "Ogiltig bilagesökväg" }, { status: 400 });
      }
      if (!(await fileExists(candidate))) {
        return NextResponse.json({ error: "Bilagan hittades inte" }, { status: 400 });
      }
      attachmentPath = candidate;
    }
  }

  if (!mapVersionId) {
    return NextResponse.json({ error: "Kartversion krävs" }, { status: 400 });
  }
  if (!category) {
    return NextResponse.json({ error: "Ogiltig kategori" }, { status: 400 });
  }
  if (!comment) {
    return NextResponse.json(
      { error: "Kommentar krävs (minst 2 tecken)" },
      { status: 400 },
    );
  }
  if (!geometries) {
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

  let suggestion;
  try {
    suggestion = await createSuggestion({
      mapFileId: map.id,
      mapVersionId: version.id,
      createdById: session.user.id,
      category,
      title,
      comment,
      geometries,
      attachmentPath,
    });
  } catch (err) {
    if (attachmentPath) {
      await deleteFile(attachmentPath).catch(() => undefined);
    }
    throw err;
  }

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

  const latestPublishedVersionNumber = await getLatestPublishedVersionNumber(map.id);
  return NextResponse.json(
    serializeSuggestionDetail(suggestion, latestPublishedVersionNumber),
    { status: 201 },
  );
}
