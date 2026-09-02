import { requireSession } from "@/lib/auth/api";
import { assertSuggestionCreateAccess } from "@/lib/suggestion/access";
import { prisma } from "@/lib/prisma";
import { fileExists } from "@/lib/storage";
import {
  blobRefToPathname,
  isSuggestionAttachmentPath,
} from "@/lib/storage/blob-path-security";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ slug: string }> };

export async function POST(request: Request, { params }: RouteParams) {
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

  let body: { blobUrl?: string };
  try {
    body = (await request.json()) as { blobUrl?: string };
  } catch {
    return NextResponse.json({ error: "Ogiltig JSON" }, { status: 400 });
  }

  if (!body.blobUrl?.trim()) {
    return NextResponse.json({ error: "blobUrl saknas" }, { status: 400 });
  }

  const attachmentPath = blobRefToPathname(body.blobUrl);
  if (!isSuggestionAttachmentPath(attachmentPath, map.id)) {
    return NextResponse.json({ error: "Ogiltig bilagesökväg" }, { status: 400 });
  }

  if (!(await fileExists(attachmentPath))) {
    return NextResponse.json({ error: "Bilagan hittades inte" }, { status: 400 });
  }

  return NextResponse.json({ attachmentPath });
}
