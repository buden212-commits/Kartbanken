import { requireSession } from "@/lib/auth/api";
import {
  assertSuggestionCreateAccess,
  validateSuggestionAttachmentFilename,
} from "@/lib/suggestion/access";
import { prisma } from "@/lib/prisma";
import { buildSuggestionAttachmentPath, shouldUseClientUpload } from "@/lib/storage";
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

  let body: { filename?: string; size?: number };
  try {
    body = (await request.json()) as { filename?: string; size?: number };
  } catch {
    return NextResponse.json({ error: "Ogiltig JSON" }, { status: 400 });
  }

  if (!body.filename || typeof body.size !== "number") {
    return NextResponse.json({ error: "filename och size krävs" }, { status: 400 });
  }

  const validation = validateSuggestionAttachmentFilename(body.filename, body.size);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  if (!shouldUseClientUpload(body.size)) {
    return NextResponse.json(
      { error: "Använd direktuppladdning för små bilder" },
      { status: 400 },
    );
  }

  const storagePath = buildSuggestionAttachmentPath(map.id, body.filename);

  return NextResponse.json({ storagePath });
}
