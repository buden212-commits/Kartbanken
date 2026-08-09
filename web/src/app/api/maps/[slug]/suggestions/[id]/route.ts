import { requireSession } from "@/lib/auth/api";
import { canAdmin } from "@/lib/auth/permissions";
import { logAction } from "@/lib/audit";
import {
  assertSuggestionEditAccess,
  assertSuggestionReviewAccess,
  assertSuggestionViewAccess,
  validateSuggestionCategory,
  validateSuggestionComment,
  validateSuggestionGeometry,
  validateSuggestionReviewStatus,
  validateSuggestionTitle,
} from "@/lib/suggestion/access";
import {
  deleteSuggestion,
  getLatestPublishedVersionNumber,
  getSuggestionById,
  serializeSuggestionDetail,
  updateSuggestion,
} from "@/lib/suggestion/repository";
import {
  SUGGESTION_CATEGORY_LABELS,
  SUGGESTION_STATUS_LABELS,
  SuggestionStatus,
} from "@/lib/suggestion/types";
import { queueNotifyMapSuggestionReviewed } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ slug: string; id: string }> };

async function loadSuggestion(slug: string, suggestionId: string) {
  const map = await prisma.mapFile.findUnique({
    where: { slug },
    select: { id: true, title: true, slug: true },
  });
  if (!map) return { error: NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 }) };

  const suggestion = await getSuggestionById(suggestionId);
  if (!suggestion || suggestion.mapFileId !== map.id) {
    return { error: NextResponse.json({ error: "Förslaget hittades inte" }, { status: 404 }) };
  }

  return { suggestion, map };
}

const REVIEWABLE_STATUSES = [SuggestionStatus.OPEN, SuggestionStatus.IN_PROGRESS] as const;

export async function GET(_request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const { slug, id } = await params;
  const result = await loadSuggestion(slug, id);
  if ("error" in result && result.error) return result.error;

  const denied = assertSuggestionViewAccess(session, result.suggestion!);
  if (denied) return denied;

  const latestPublishedVersionNumber = await getLatestPublishedVersionNumber(result.map!.id);
  return NextResponse.json(
    serializeSuggestionDetail(result.suggestion!, latestPublishedVersionNumber),
  );
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const { slug, id } = await params;
  const result = await loadSuggestion(slug, id);
  if ("error" in result && result.error) return result.error;

  const suggestion = result.suggestion!;
  const map = result.map!;

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
  const hasStatus = "status" in record;

  if (hasStatus) {
    const reviewDenied = assertSuggestionReviewAccess(session);
    if (reviewDenied) return reviewDenied;

    if (!REVIEWABLE_STATUSES.includes(suggestion.status as (typeof REVIEWABLE_STATUSES)[number])) {
      return NextResponse.json(
        { error: "Förslaget kan inte granskas i nuvarande status" },
        { status: 400 },
      );
    }

    const status = validateSuggestionReviewStatus(record.status);
    if (!status) {
      return NextResponse.json({ error: "Ogiltig status" }, { status: 400 });
    }

    const reviewComment =
      typeof record.reviewComment === "string" ? record.reviewComment.trim() : "";
    if (status === SuggestionStatus.REJECTED && reviewComment.length < 3) {
      return NextResponse.json(
        { error: "Kommentar krävs vid avvisning" },
        { status: 400 },
      );
    }

    let checkoutId: string | null | undefined;
    if ("checkoutId" in record) {
      checkoutId = typeof record.checkoutId === "string" ? record.checkoutId : null;
      if (checkoutId) {
        const checkout = await prisma.mapCheckout.findFirst({
          where: { id: checkoutId, mapFileId: map.id },
          select: { id: true },
        });
        if (!checkout) {
          return NextResponse.json({ error: "Checkout hittades inte" }, { status: 400 });
        }
      }
    }

    let integratedVersionId: string | null | undefined;
    if ("integratedVersionId" in record) {
      integratedVersionId =
        typeof record.integratedVersionId === "string" ? record.integratedVersionId : null;
      if (integratedVersionId) {
        const version = await prisma.mapVersion.findFirst({
          where: { id: integratedVersionId, mapFileId: map.id, isPublished: true },
          select: { id: true },
        });
        if (!version) {
          return NextResponse.json({ error: "Ogiltig integrerad version" }, { status: 400 });
        }
      }
    }

    const previousStatus = suggestion.status;
    const updated = await updateSuggestion(id, {
      status,
      reviewComment: reviewComment || null,
      reviewedById: session.user.id,
      reviewedAt: new Date(),
      checkoutId,
      integratedVersionId,
    });

    await logAction(session.user.id, "SUGGESTION_REVIEWED", "MapSuggestion", id, {
      mapSlug: slug,
      status,
      statusLabel: SUGGESTION_STATUS_LABELS[status],
    });

    if (
      previousStatus === SuggestionStatus.OPEN &&
      (status === SuggestionStatus.IN_PROGRESS ||
        status === SuggestionStatus.IMPLEMENTED ||
        status === SuggestionStatus.REJECTED)
    ) {
      queueNotifyMapSuggestionReviewed({
        mapTitle: map.title,
        mapSlug: map.slug,
        suggestionId: id,
        versionNumber: suggestion.mapVersion.versionNumber,
        categoryLabel: SUGGESTION_CATEGORY_LABELS[suggestion.category as keyof typeof SUGGESTION_CATEGORY_LABELS],
        comment: suggestion.comment,
        statusLabel: SUGGESTION_STATUS_LABELS[status],
        reviewComment: reviewComment || null,
        creatorEmail: suggestion.createdBy.email,
        creatorName: suggestion.createdBy.name,
        receiveNotifications: suggestion.createdBy.receiveNotifications,
      });
    }

    const latestPublishedVersionNumber = await getLatestPublishedVersionNumber(map.id);
    return NextResponse.json(
      serializeSuggestionDetail(updated, latestPublishedVersionNumber),
    );
  }

  const editDenied = assertSuggestionEditAccess(session, suggestion);
  if (editDenied) return editDenied;

  const updates: {
    category?: string;
    title?: string | null;
    comment?: string;
    geometry?: NonNullable<ReturnType<typeof validateSuggestionGeometry>>;
  } = {};

  if ("category" in record) {
    const category = validateSuggestionCategory(record.category);
    if (!category) {
      return NextResponse.json({ error: "Ogiltig kategori" }, { status: 400 });
    }
    updates.category = category;
  }

  if ("title" in record) {
    updates.title = validateSuggestionTitle(record.title);
    if (record.title != null && record.title !== "" && updates.title === null) {
      return NextResponse.json({ error: "Ogiltig rubrik" }, { status: 400 });
    }
  }

  if ("comment" in record) {
    const comment = validateSuggestionComment(record.comment);
    if (!comment) {
      return NextResponse.json(
        { error: "Kommentar krävs (minst 2 tecken)" },
        { status: 400 },
      );
    }
    updates.comment = comment;
  }

  if ("geometry" in record) {
    const geometry = validateSuggestionGeometry(record.geometry);
    if (!geometry) {
      return NextResponse.json({ error: "Ogiltig markering på kartan" }, { status: 400 });
    }
    updates.geometry = geometry;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Inga fält att uppdatera" }, { status: 400 });
  }

  const updated = await updateSuggestion(id, updates);

  await logAction(session.user.id, "SUGGESTION_UPDATED", "MapSuggestion", id, {
    mapSlug: slug,
  });

  const latestPublishedVersionNumber = await getLatestPublishedVersionNumber(map.id);
  return NextResponse.json(
    serializeSuggestionDetail(updated, latestPublishedVersionNumber),
  );
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const { slug, id } = await params;
  const result = await loadSuggestion(slug, id);
  if ("error" in result && result.error) return result.error;

  const suggestion = result.suggestion!;
  const isOwner = suggestion.createdById === session.user.id;
  const isAdmin = canAdmin(session.user.role);

  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "Ingen behörighet att radera" }, { status: 403 });
  }
  if (isOwner && !isAdmin && suggestion.status !== SuggestionStatus.OPEN) {
    return NextResponse.json({ error: "Endast öppna förslag kan raderas" }, { status: 400 });
  }

  await deleteSuggestion(id);

  await logAction(session.user.id, "SUGGESTION_DELETED", "MapSuggestion", id, {
    mapSlug: slug,
  });

  return NextResponse.json({ ok: true });
}
