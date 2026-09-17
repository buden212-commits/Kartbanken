import { requireSession } from "@/lib/auth/api";
import { canCreateCourse } from "@/lib/auth/permissions";
import { listLayerObjects } from "@/lib/course/repository";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  if (!canCreateCourse(session.user.role)) {
    return NextResponse.json({ error: "Ingen behörighet" }, { status: 403 });
  }

  const { slug } = await params;
  const map = await prisma.mapFile.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!map) {
    return NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 });
  }

  const objects = await listLayerObjects(map.id);
  return NextResponse.json({ objects });
}
