import { requireFieldEdit } from "@/lib/auth/api";
import { canAdmin } from "@/lib/auth/permissions";
import { cancelCheckout, getCheckoutById, serializeCheckoutResponse } from "@/lib/checkout/repository";
import { CheckoutMode, CheckoutStatus } from "@/lib/checkout/types";
import { logAction } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ slug: string; id: string }> };

async function loadFieldEdit(slug: string, id: string) {
  const map = await prisma.mapFile.findUnique({ where: { slug }, select: { id: true } });
  if (!map) return { error: NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 }) };

  const checkout = await getCheckoutById(map.id, id);
  if (!checkout) {
    return { error: NextResponse.json({ error: "Fältredigering hittades inte" }, { status: 404 }) };
  }
  if (checkout.mode !== CheckoutMode.FIELD_EDIT) {
    return { error: NextResponse.json({ error: "Inte en fältredigeringssession" }, { status: 404 }) };
  }

  return { map, checkout };
}

export async function GET(_request: Request, { params }: RouteParams) {
  const session = await requireFieldEdit();
  if (session instanceof NextResponse) return session;

  const { slug, id } = await params;
  const loaded = await loadFieldEdit(slug, id);
  if ("error" in loaded && loaded.error) return loaded.error;

  return NextResponse.json(serializeCheckoutResponse(loaded.checkout!));
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const session = await requireFieldEdit();
  if (session instanceof NextResponse) return session;

  const { slug, id } = await params;
  const loaded = await loadFieldEdit(slug, id);
  if ("error" in loaded && loaded.error) return loaded.error;

  const checkout = loaded.checkout!;
  if (
    checkout.status !== CheckoutStatus.ACTIVE &&
    checkout.status !== CheckoutStatus.PENDING_ADMIN_CONFIRM
  ) {
    return NextResponse.json({ error: "Endast aktiva eller inskickade fältredigeringar kan avbrytas" }, { status: 409 });
  }

  const isOwner = checkout.userId === session.user.id;
  const isAdmin = canAdmin(session.user.role);
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "Endast ägaren eller admin kan avbryta fältredigeringen" }, { status: 403 });
  }

  let cancelReason: string | null = null;
  try {
    const body = await request.json();
    if (body && typeof body === "object" && typeof (body as Record<string, unknown>).reason === "string") {
      cancelReason = (body as Record<string, string>).reason;
    }
  } catch {
    // optional body
  }

  const result = await cancelCheckout({
    checkoutId: id,
    mapFileId: loaded.map!.id,
    cancelledById: session.user.id,
    cancelReason,
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "Kunde inte avbryta fältredigeringen" }, { status: 409 });
  }

  await logAction(session.user.id, "FIELD_EDIT_CANCELLED", "MapCheckout", id, { mapSlug: slug });

  const refreshed = await getCheckoutById(loaded.map!.id, id);
  return NextResponse.json(refreshed ? serializeCheckoutResponse(refreshed) : { ok: true });
}
