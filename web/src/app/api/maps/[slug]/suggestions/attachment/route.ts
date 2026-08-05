import { requireSession } from "@/lib/auth/api";
import { assertSuggestionCreateAccess, validateSuggestionAttachmentFilename } from "@/lib/suggestion/access";
import {
  buildSuggestionAttachmentPath,
  deleteFile,
  shouldUseClientUpload,
  uploadFile,
} from "@/lib/storage";
import { prisma } from "@/lib/prisma";
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

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Ogiltig uppladdning" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Ingen fil uppladdad" }, { status: 400 });
  }

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
    const storedRef = await uploadFile(storagePath, buffer);
    return NextResponse.json({ attachmentPath: storedRef });
  } catch (err) {
    await deleteFile(storagePath).catch(() => undefined);
    console.error("Suggestion attachment upload failed:", err);
    return NextResponse.json({ error: "Uppladdning misslyckades" }, { status: 500 });
  }
}
