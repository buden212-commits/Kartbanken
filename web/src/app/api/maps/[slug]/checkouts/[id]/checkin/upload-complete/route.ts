import { logAction } from "@/lib/audit";
import { requireSession } from "@/lib/auth/api";
import { canCheckin } from "@/lib/auth/permissions";
import {
  markCheckoutDiffPending,
  scheduleCheckoutSubsetDiff,
} from "@/lib/checkout/diff-status";
import { getCheckoutById, updateCheckoutCheckin } from "@/lib/checkout/repository";
import { CheckoutStatus } from "@/lib/checkout/types";
import { notifyCheckinSubmitted } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { deleteFile } from "@/lib/storage";
import { NextResponse } from "next/server";

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
    return NextResponse.json({ error: "Checkout hittades inte" }, { status: 404 });
  }

  if (checkout.userId !== session.user.id && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Endast checkout-ägaren kan checka in" }, { status: 403 });
  }

  let body: { blobUrl?: string; comment?: string };
  try {
    body = (await request.json()) as { blobUrl?: string; comment?: string };
  } catch {
    return NextResponse.json({ error: "Ogiltig JSON" }, { status: 400 });
  }

  if (!body.blobUrl) {
    return NextResponse.json({ error: "blobUrl saknas" }, { status: 400 });
  }

  const integrationComment = body.comment?.trim() || null;

  if (checkout.checkinStoragePath) {
    await deleteFile(checkout.checkinStoragePath).catch(() => undefined);
  }

  await updateCheckoutCheckin(
    checkout.id,
    body.blobUrl,
    CheckoutStatus.CHECKED_IN,
    integrationComment,
  );
  await markCheckoutDiffPending(checkout.id);

  await logAction(session.user.id, "CHECKIN_SUBMITTED", "MapCheckout", checkout.id, {
    mapSlug: slug,
    via: "blob",
  });

  notifyCheckinSubmitted({
    checkoutId: checkout.id,
    map: { title: map.title, slug: map.slug },
    owner: { name: checkout.user.name, email: checkout.user.email },
    checkin: {
      storagePath: body.blobUrl,
      filename: `${map.title.replace(/\s+/g, "-")}-checkin.ocd`,
    },
  });

  scheduleCheckoutSubsetDiff(checkout.id);

  return NextResponse.json({ ok: true, status: CheckoutStatus.CHECKED_IN });
}
