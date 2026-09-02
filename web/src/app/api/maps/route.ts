import { logAction } from "@/lib/audit";
import { requireAdmin, requireSession } from "@/lib/auth/api";
import { canAdmin } from "@/lib/auth/permissions";
import { mapListWhereForRole, versionVisibilityFilter } from "@/lib/maps/version-query";
import { prisma } from "@/lib/prisma";
import { slugify, uniqueSlug } from "@/lib/slug";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const isAdmin = canAdmin(session.user.role);
  const maps = await prisma.mapFile.findMany({
    where: mapListWhereForRole(session.user.role, isAdmin),
    orderBy: { title: "asc" },
    include: {
      versions: {
        where: versionVisibilityFilter(session.user.role),
        orderBy: { versionNumber: "desc" },
        take: 1,
        include: {
          mapFile: false,
        },
      },
    },
  });

  const result = await Promise.all(
    maps.map(async (map) => {
      const latest = map.versions[0] ?? null;
      let uploadedByName: string | null = null;
      if (latest?.uploadedById) {
        const uploader = await prisma.user.findUnique({
          where: { id: latest.uploadedById },
          select: { name: true, email: true },
        });
        uploadedByName = uploader?.name ?? uploader?.email ?? null;
      }

      const recommended = await prisma.mapVersion.findFirst({
        where: {
          mapFileId: map.id,
          isRecommended: true,
          ...versionVisibilityFilter(session.user.role),
        },
        orderBy: { versionNumber: "desc" },
      });

      return {
        id: map.id,
        slug: map.slug,
        title: map.title,
        description: map.description,
        createdAt: map.createdAt,
        latestVersion: latest
          ? {
              id: latest.id,
              versionNumber: latest.versionNumber,
              uploadedAt: latest.uploadedAt,
              uploadedByName,
              fileSizeBytes: latest.fileSizeBytes,
              parseStatus: latest.parseStatus,
            }
          : null,
        recommendedVersionNumber: recommended?.versionNumber ?? null,
      };
    }),
  );

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  let body: { title?: string; description?: string; slug?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ogiltig JSON" }, { status: 400 });
  }

  const title = body.title?.trim();
  if (!title) {
    return NextResponse.json({ error: "Titel krävs" }, { status: 400 });
  }

  const description = body.description?.trim() || null;
  const slug = body.slug?.trim()
    ? slugify(body.slug)
    : await uniqueSlug(title, async (s) => {
        const existing = await prisma.mapFile.findUnique({ where: { slug: s } });
        return Boolean(existing);
      });

  if (!slug) {
    return NextResponse.json({ error: "Ogiltig slug" }, { status: 400 });
  }

  const existing = await prisma.mapFile.findUnique({ where: { slug } });
  if (existing) {
    return NextResponse.json({ error: "Slug finns redan" }, { status: 409 });
  }

  const map = await prisma.mapFile.create({
    data: {
      title,
      slug,
      description,
      createdById: session.user.id,
    },
  });

  await logAction(session.user.id, "MAP_CREATE", "MapFile", map.id, { title, slug });

  return NextResponse.json(map, { status: 201 });
}
