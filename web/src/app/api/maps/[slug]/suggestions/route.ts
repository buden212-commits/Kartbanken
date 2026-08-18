import { requireSession } from "@/lib/auth/api";
import { logAction } from "@/lib/audit";
import {
  assertOpenSuggestionQuota,
  assertSuggestionCreateAccess,
  parseSuggestionGeometriesFromRecord,
  validateSuggestionCategory,
  validateSuggestionComment,
  validateSuggestionGeometries,
  validateSuggestionLocationConfidence,
  validateSuggestionTitle,
  validateSuggestionAttachmentFilename,
} from "@/lib/suggestion/access";
import {
  countOpenSuggestionsForUser,
  createSuggestion,
  getLatestPublishedVersionNumber,
  getSuggestionById,
  listSuggestionOverlaysForVersion,
  listPendingSuggestionOverlaysForMap,
  listSuggestionsForMap,
  serializeSuggestionDetail,
  serializeSuggestionSummary,
  updateSuggestion,
} from "@/lib/suggestion/repository";
import { SUGGESTION_CATEGORY_LABELS, SUGGESTION_LOCATION_CONFIDENCE_LABELS, SuggestionStatus } from "@/lib/suggestion/types";
import { queueNotifyNewMapSuggestion } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import {
  buildSuggestionAttachmentPath,
  deleteFile,
  fileExists,
  shouldUseClientUpload,
  uploadFile,
} from "@/lib/storage";
import {
  blobRefToPathname,
  isSuggestionAttachmentPath,
} from "@/lib/storage/blob-path-security";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ slug: string }> };

function parseClientDraftId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length < 8 || trimmed.length > 80) return null;
  if (!/^[\w.-]+$/.test(trimmed)) return null;
  return trimmed;
}

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
          markingLabel: String(item.sortOrder + 1),
          geometry: item.geometry,
        })),
      });
    }

    const items = await listPendingSuggestionOverlaysForMap(map.id);
    return NextResponse.json({
      overlays: items.map((item) => ({
        id: item.id,
        status: item.status,
        markingLabel: String(item.sortOrder + 1),
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
  let locationConfidence: ReturnType<typeof validateSuggestionLocationConfidence> = null;
  let comment: ReturnType<typeof validateSuggestionComment> = null;
  let title: ReturnType<typeof validateSuggestionTitle> = null;
  let geometries: ReturnType<typeof validateSuggestionGeometries> = null;
  let attachmentPath: string | null = null;
  let clientDraftId: string | null = null;

  if (contentType.includes("multipart/form-data")) {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: "Ogiltig uppladdning" }, { status: 400 });
    }

    mapVersionId = formData.get("mapVersionId")?.toString() ?? null;
    category = validateSuggestionCategory(formData.get("category"));
    locationConfidence = validateSuggestionLocationConfidence(
      formData.get("locationConfidence"),
    );
    comment = validateSuggestionComment(formData.get("comment"));
    title = validateSuggestionTitle(formData.get("title"));
    clientDraftId = parseClientDraftId(formData.get("clientDraftId")?.toString());
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
    locationConfidence = validateSuggestionLocationConfidence(record.locationConfidence);
    comment = validateSuggestionComment(record.comment);
    title = validateSuggestionTitle(record.title);
    geometries = parseSuggestionGeometriesFromRecord(record);

    if (typeof record.attachmentPath === "string" && record.attachmentPath.trim()) {
      const candidate = blobRefToPathname(record.attachmentPath.trim());
      if (!isSuggestionAttachmentPath(candidate, map.id)) {
        return NextResponse.json({ error: "Ogiltig bilagesökväg" }, { status: 400 });
      }
      if (!(await fileExists(candidate))) {
        return NextResponse.json({ error: "Bilagan hittades inte" }, { status: 400 });
      }
      attachmentPath = candidate;
    }
    clientDraftId = parseClientDraftId(record.clientDraftId);
  }

  if (!mapVersionId) {
    return NextResponse.json({ error: "Kartversion krävs" }, { status: 400 });
  }
  if (!category) {
    return NextResponse.json({ error: "Ogiltig kategori" }, { status: 400 });
  }
  if (!locationConfidence) {
    return NextResponse.json({ error: "Ange hur säker du är på platsen" }, { status: 400 });
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

  const existingDraft =
    clientDraftId != null
      ? await prisma.mapSuggestion.findUnique({
          where: { clientDraftId },
          select: { id: true, createdById: true, mapFileId: true, status: true },
        })
      : null;

  if (existingDraft) {
    if (existingDraft.createdById !== session.user.id || existingDraft.mapFileId !== map.id) {
      return NextResponse.json({ error: "Utkastet tillhör en annan användare" }, { status: 409 });
    }

    const latestPublishedVersionNumber = await getLatestPublishedVersionNumber(map.id);
    if (existingDraft.status !== SuggestionStatus.OPEN) {
      const full = await getSuggestionById(existingDraft.id);
      if (!full) {
        return NextResponse.json({ error: "Förslaget hittades inte" }, { status: 404 });
      }
      return NextResponse.json(serializeSuggestionDetail(full, latestPublishedVersionNumber), {
        status: 200,
      });
    }

    const updated = await updateSuggestion(existingDraft.id, {
      category,
      locationConfidence,
      title,
      comment,
      geometries,
      ...(attachmentPath ? { attachmentPath } : {}),
    });

    await logAction(session.user.id, "SUGGESTION_UPDATED", "MapSuggestion", updated.id, {
      mapSlug: slug,
      clientDraftId,
    });

    return NextResponse.json(serializeSuggestionDetail(updated, latestPublishedVersionNumber), {
      status: 200,
    });
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
      locationConfidence,
      title,
      comment,
      geometries,
      attachmentPath,
      clientDraftId,
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
    locationConfidence,
    locationConfidenceLabel: SUGGESTION_LOCATION_CONFIDENCE_LABELS[locationConfidence],
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
