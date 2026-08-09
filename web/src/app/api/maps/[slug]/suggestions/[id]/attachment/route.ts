import { requireSession } from "@/lib/auth/api";
import { assertSuggestionViewAccess } from "@/lib/suggestion/access";
import { getSuggestionById } from "@/lib/suggestion/repository";
import { contentTypeForAttachmentPath, readStoredFile } from "@/lib/storage";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ slug: string; id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const { slug, id } = await params;
  const map = await prisma.mapFile.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!map) {
    return NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 });
  }

  const suggestion = await getSuggestionById(id);
  if (!suggestion || suggestion.mapFileId !== map.id) {
    return NextResponse.json({ error: "Förslaget hittades inte" }, { status: 404 });
  }

  const denied = assertSuggestionViewAccess(session, suggestion);
  if (denied) return denied;

  if (!suggestion.attachmentPath) {
    return NextResponse.json({ error: "Ingen bilaga" }, { status: 404 });
  }

  try {
    const data = await readStoredFile(suggestion.attachmentPath);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": contentTypeForAttachmentPath(suggestion.attachmentPath),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Bilagan kunde inte läsas" }, { status: 404 });
  }
}
