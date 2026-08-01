import { requireSession } from "@/lib/auth/api";
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
