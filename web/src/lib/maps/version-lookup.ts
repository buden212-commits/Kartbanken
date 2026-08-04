import type { AuthSession } from "@/lib/auth/api";
import { canViewVersion } from "@/lib/auth/version-access";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type MapVersionAccess = {
  id: string;
  mapFileId: string;
  versionNumber: number;
  isPublished: boolean;
};

export async function getMapVersionOr404(
  slug: string,
  versionId: string,
): Promise<
  | { map: { id: string; slug: string; title: string }; version: MapVersionAccess }
  | NextResponse
> {
  const map = await prisma.mapFile.findUnique({ where: { slug } });
  if (!map) {
    return NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 });
  }

  const version = await prisma.mapVersion.findFirst({
    where: { id: versionId, mapFileId: map.id },
    select: {
      id: true,
      mapFileId: true,
      versionNumber: true,
      isPublished: true,
    },
  });

  if (!version) {
    return NextResponse.json({ error: "Version hittades inte" }, { status: 404 });
  }

  return { map, version };
}

export function assertVersionViewAccess(
  session: AuthSession,
  version: { isPublished: boolean },
): NextResponse | null {
  if (!canViewVersion(session.user.role, version.isPublished)) {
    return NextResponse.json(
      { error: "Versionen är inte publicerad" },
      { status: 403 },
    );
  }
  return null;
}
