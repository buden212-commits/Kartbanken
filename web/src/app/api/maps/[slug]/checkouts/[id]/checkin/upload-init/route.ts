import { requireSession } from "@/lib/auth/api";
import { canCheckin } from "@/lib/auth/permissions";
import { getCheckoutById } from "@/lib/checkout/repository";
import { CheckoutStatus } from "@/lib/checkout/types";
import { prisma } from "@/lib/prisma";
import { buildCheckoutCheckinPath, shouldUseClientUpload } from "@/lib/storage";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ slug: string; id: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  if (!canCheckin(session.user.role)) {
    return NextResponse.json({ error: "Ingen behörighet" }, { status: 403 });
  }

  const { slug, id } = await params;
  const map = await prisma.mapFile.findUnique({ where: { slug }, select: { id: true } });
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

  let body: { filename?: string; size?: number; comment?: string };
  try {
    body = (await request.json()) as { filename?: string; size?: number; comment?: string };
  } catch {
    return NextResponse.json({ error: "Ogiltig JSON" }, { status: 400 });
  }

  if (!body.filename || typeof body.size !== "number") {
    return NextResponse.json({ error: "filename och size krävs" }, { status: 400 });
  }

  const integrationComment = body.comment?.trim() || null;
  if (integrationComment !== null) {
    await prisma.mapCheckout.update({
      where: { id: checkout.id },
      data: { integrationComment },
    });
  }

  if (!shouldUseClientUpload(body.size)) {
    return NextResponse.json(
      { error: "Använd direkt checkin-uppladdning för små filer" },
      { status: 400 },
    );
  }

  const storagePath = buildCheckoutCheckinPath(map.id, checkout.id);

  return NextResponse.json({
    checkoutId: checkout.id,
    storagePath,
    allowedStatuses: [CheckoutStatus.ACTIVE, CheckoutStatus.CHECKED_IN],
  });
}
