import { logAction } from "@/lib/audit";
import { requireSession } from "@/lib/auth/api";
import {
  canAdminConfirmIntegration,
  canCancelCheckout,
  canConfirmCheckoutIntegration,
  canViewCheckouts,
} from "@/lib/auth/permissions";
import { cancelCheckout, getCheckoutById, serializeCheckoutResponse } from "@/lib/checkout/repository";
import { CheckoutMode, CheckoutStatus } from "@/lib/checkout/types";
import { notifyCheckoutCancelled } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ slug: string; id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  if (!canViewCheckouts(session.user.role)) {
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

  const canViewDetail =
    canAdminConfirmIntegration(session.user.role) ||
    canConfirmCheckoutIntegration(session.user.role, checkout.userId, session.user.id);

  if (!canViewDetail) {
    return NextResponse.json({ error: "Ingen behörighet att visa utcheckning" }, { status: 403 });
  }

  return NextResponse.json(serializeCheckoutResponse(checkout));
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  if (!canCancelCheckout(session.user.role)) {
    return NextResponse.json({ error: "Endast admin kan avbryta utcheckningar" }, { status: 403 });
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

  const cancellableStatuses: CheckoutStatus[] =
    checkout.mode === CheckoutMode.FIELD_EDIT
      ? [CheckoutStatus.ACTIVE]
      : [
          CheckoutStatus.ACTIVE,
          CheckoutStatus.CHECKED_IN,
          CheckoutStatus.PENDING_ADMIN_CONFIRM,
        ];

  if (
    checkout.status === CheckoutStatus.INTEGRATED ||
    checkout.status === CheckoutStatus.CANCELLED ||
    !cancellableStatuses.includes(checkout.status as CheckoutStatus)
  ) {
    return NextResponse.json(
      { error: "Utcheckningen kan inte avbrytas i nuvarande status" },
      { status: 400 },
    );
  }

  let cancelReason: string | null = null;
  try {
    const body = (await request.json()) as { reason?: string };
    cancelReason = body.reason?.trim() || null;
  } catch {
    cancelReason = null;
  }

  const result = await cancelCheckout({
    checkoutId: checkout.id,
    mapFileId: map.id,
    cancelledById: session.user.id,
    cancelReason,
  });

  if (result.count === 0) {
    return NextResponse.json(
      { error: "Utcheckningen kunde inte avbrytas (redan avslutad?)" },
      { status: 409 },
    );
  }

  await logAction(session.user.id, "CHECKOUT_CANCELLED", "MapCheckout", checkout.id, {
    mapSlug: slug,
    reason: cancelReason,
  });

  notifyCheckoutCancelled({
    checkoutId: checkout.id,
    map: { title: map.title, slug: map.slug },
    owner: { name: checkout.user.name, email: checkout.user.email },
    reason: cancelReason,
  });

  return NextResponse.json({ ok: true, status: CheckoutStatus.CANCELLED });
}
