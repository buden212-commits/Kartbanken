import { logAction } from "@/lib/audit";
import { requireAdmin, requireSession } from "@/lib/auth/api";
import { setMapArchived } from "@/lib/maps/archive-map";
import { deleteMapFile } from "@/lib/maps/delete-map";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const { slug } = await params;

  const map = await prisma.mapFile.findUnique({
    where: { slug },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
      },
    },
  });

  if (!map) {
    return NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 });
  }

  const uploaderIds = [...new Set(map.versions.map((v) => v.uploadedById).filter(Boolean))] as string[];
  const uploaders = uploaderIds.length
    ? await prisma.user.findMany({
        where: { id: { in: uploaderIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const uploaderMap = new Map(uploaders.map((u) => [u.id, u]));

  return NextResponse.json({
    id: map.id,
    slug: map.slug,
    title: map.title,
    description: map.description,
    archivedAt: map.archivedAt,
    createdAt: map.createdAt,
    versions: map.versions.map((v) => {
      const uploader = v.uploadedById ? uploaderMap.get(v.uploadedById) : null;
      return {
        id: v.id,
        versionNumber: v.versionNumber,
        originalFilename: v.originalFilename,
        fileSizeBytes: v.fileSizeBytes,
        contentHash: v.contentHash,
        uploadedAt: v.uploadedAt,
        comment: v.comment,
        isRecommended: v.isRecommended,
        parseStatus: v.parseStatus,
        parseError: v.parseError,
        objectCount: v.objectCount,
        uploadedBy: uploader
          ? { name: uploader.name, email: uploader.email }
          : null,
      };
    }),
  });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  const { slug } = await params;

  let body: { title?: string; archived?: boolean };
  try {
    body = (await request.json()) as { title?: string; archived?: boolean };
  } catch {
    return NextResponse.json({ error: "Ogiltig JSON" }, { status: 400 });
  }

  const map = await prisma.mapFile.findUnique({ where: { slug } });
  if (!map) {
    return NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 });
  }

  if (typeof body.archived === "boolean") {
    const updated = await setMapArchived(map.id, body.archived);
    await logAction(session.user.id, body.archived ? "MAP_ARCHIVED" : "MAP_UNARCHIVED", "MapFile", map.id, {
      slug: map.slug,
      title: map.title,
    });
    return NextResponse.json(updated);
  }

  const title = body.title?.trim();
  if (!title) {
    return NextResponse.json({ error: "Titel krävs" }, { status: 400 });
  }

  if (title === map.title) {
    return NextResponse.json({
      id: map.id,
      slug: map.slug,
      title: map.title,
      description: map.description,
      archivedAt: map.archivedAt,
    });
  }

  const updated = await prisma.mapFile.update({
    where: { id: map.id },
    data: { title },
    select: { id: true, slug: true, title: true, description: true, archivedAt: true },
  });

  await logAction(session.user.id, "MAP_RENAMED", "MapFile", map.id, {
    slug: map.slug,
    previousTitle: map.title,
    newTitle: title,
  });

  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  const { slug } = await params;

  const map = await prisma.mapFile.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (!map) {
    return NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 });
  }

  const result = await deleteMapFile(map.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  await logAction(session.user.id, "MAP_DELETED", "MapFile", map.id, {
    slug: result.slug,
    title: result.title,
    versionCount: result.versionCount,
  });

  return NextResponse.json({ ok: true });
}
