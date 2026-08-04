import { logAction } from "@/lib/audit";
import { requireSession } from "@/lib/auth/api";
import { canConfirmCheckoutIntegration } from "@/lib/auth/permissions";
import { parseCheckoutDiffFromRecord } from "@/lib/checkout/diff-status";
import { confirmCheckoutByUser, getCheckoutById } from "@/lib/checkout/repository";
import { CheckoutStatus } from "@/lib/checkout/types";
import { notifyCheckoutUserConfirmed } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ slug: string; id: string }> };

export async function POST(_request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

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

  if (
    !canConfirmCheckoutIntegration(session.user.role, checkout.userId, session.user.id)
  ) {
    return NextResponse.json({ error: "Ingen behörighet att bekräfta" }, { status: 403 });
  }

  if (checkout.status !== CheckoutStatus.CHECKED_IN) {
    return NextResponse.json(
      { error: "Checkout väntar inte på användarbekräftelse" },
      { status: 400 },
    );
  }

  const diffStatus = parseCheckoutDiffFromRecord(checkout);
  if (diffStatus.status === "pending") {
    return NextResponse.json(
      { error: "Diff beräknas fortfarande — försök igen om en stund" },
      { status: 409 },
    );
  }
  if (diffStatus.status === "error") {
    return NextResponse.json(
      { error: `Diff misslyckades: ${diffStatus.error}` },
      { status: 409 },
    );
  }
  if (diffStatus.status !== "ready") {
    return NextResponse.json({ error: "Diff saknas för checkout" }, { status: 409 });
  }

  const updated = await confirmCheckoutByUser(checkout.id);

  await logAction(session.user.id, "CHECKOUT_USER_CONFIRMED", "MapCheckout", checkout.id, {
    mapSlug: slug,
  });

  notifyCheckoutUserConfirmed({
    checkoutId: checkout.id,
    map: { title: map.title, slug: map.slug },
    owner: { name: checkout.user.name, email: checkout.user.email },
  });

  return NextResponse.json({ ok: true, status: updated.status });
}
