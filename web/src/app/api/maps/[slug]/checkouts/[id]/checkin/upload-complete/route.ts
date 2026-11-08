import { requireSession } from "@/lib/auth/api";
import { canCheckin } from "@/lib/auth/permissions";
import { checkinStatusAllowsUpload, submitCheckin } from "@/lib/checkout/checkin-submit";
import { getCheckoutById } from "@/lib/checkout/repository";
import { CheckoutStatus } from "@/lib/checkout/types";
import { prisma } from "@/lib/prisma";
import { MAX_UPLOAD_BYTES, readStoredFile } from "@/lib/storage";
import {
  blobRefToPathname,
  isCheckoutCheckinPath,
} from "@/lib/storage/blob-path-security";
import { NextResponse } from "next/server";

export const maxDuration = 300;

type RouteParams = { params: Promise<{ slug: string; id: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  if (!canCheckin(session.user.role)) {
    return NextResponse.json({ error: "Ingen behörighet" }, { status: 403 });
  }

  const { slug, id } = await params;
  const map = await prisma.mapFile.findUnique({
    where: { slug },
    select: { id: true, title: true, slug: true },
  });
  if (!map) {
    return NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 });
  }

  const checkout = await getCheckoutById(map.id, id);
  if (!checkout) {
    return NextResponse.json({ error: "Utcheckning hittades inte" }, { status: 404 });
  }

  if (checkout.userId !== session.user.id && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Endast utcheckningsägaren kan checka in" }, { status: 403 });
  }

  if (!checkinStatusAllowsUpload(checkout.status)) {
    return NextResponse.json(
      { error: "Utcheckningen accepterar inte incheckning i nuvarande status" },
      { status: 409 },
    );
  }

  let body: { blobUrl?: string; comment?: string; filename?: string };
  try {
    body = (await request.json()) as { blobUrl?: string; comment?: string; filename?: string };
  } catch {
    return NextResponse.json({ error: "Ogiltig JSON" }, { status: 400 });
  }

  if (!body.blobUrl) {
    return NextResponse.json({ error: "blobUrl saknas" }, { status: 400 });
  }

  const checkinPath = blobRefToPathname(body.blobUrl);
  if (!isCheckoutCheckinPath(checkinPath, map.id, checkout.id)) {
    return NextResponse.json({ error: "Ogiltig checkin-sökväg" }, { status: 400 });
  }

  if (checkout.checkinStoragePath === checkinPath) {
    // Retried completion of an already registered upload.
    return NextResponse.json({ ok: true, status: CheckoutStatus.CHECKED_IN });
  }

  let buffer: Buffer;
  try {
    buffer = await readStoredFile(checkinPath);
  } catch {
    return NextResponse.json(
      { error: "Den uppladdade filen hittades inte. Ladda upp igen." },
      { status: 400 },
    );
  }
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Filen är tom eller för stor" }, { status: 400 });
  }

  try {
    const result = await submitCheckin({
      checkout,
      map,
      newStoragePath: checkinPath,
      buffer,
      userId: session.user.id,
      comment: body.comment?.trim() || null,
      filename: body.filename?.trim() || `${map.title.replace(/\s+/g, "-")}-checkin.ocd`,
      via: "blob",
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
  } catch (err) {
    console.error("Checkin registration failed:", err);
    return NextResponse.json({ error: "Checkin misslyckades" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: CheckoutStatus.CHECKED_IN });
}
