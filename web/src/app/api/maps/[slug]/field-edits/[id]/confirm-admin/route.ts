import { requireSession } from "@/lib/auth/api";
import { canAdmin } from "@/lib/auth/permissions";
import { getCheckoutById, serializeCheckoutResponse } from "@/lib/checkout/repository";
import { CheckoutMode, CheckoutStatus } from "@/lib/checkout/types";
import { publishFieldEditSession } from "@/lib/field-edit/publish";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const maxDuration = 300;

type RouteParams = { params: Promise<{ slug: string; id: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  if (!canAdmin(session.user.role)) {
    return NextResponse.json({ error: "Endast admin kan godkänna fältredigeringar" }, { status: 403 });
  }

  const { slug, id } = await params;
  const map = await prisma.mapFile.findUnique({ where: { slug }, select: { id: true } });
  if (!map) {
    return NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 });
  }

  const checkout = await getCheckoutById(map.id, id);
  if (!checkout || checkout.mode !== CheckoutMode.FIELD_EDIT) {
    return NextResponse.json({ error: "Fältredigering hittades inte" }, { status: 404 });
  }
  if (checkout.status !== CheckoutStatus.PENDING_ADMIN_CONFIRM) {
    return NextResponse.json(
      { error: "Fältredigeringen väntar inte på admin-godkännande" },
      { status: 409 },
    );
  }

  let publish = false;
  let comment: string | null = null;
  try {
    const body = await request.json();
    if (body && typeof body === "object") {
      const record = body as Record<string, unknown>;
      publish = record.publish === true;
      if (typeof record.comment === "string") {
        comment = record.comment.trim() || null;
      }
    }
  } catch {
    // optional
  }

  try {
    const result = await publishFieldEditSession(id, session.user.id, {
      publish,
      comment: comment ?? checkout.integrationComment,
      allowPendingAdmin: true,
    });
    const refreshed = await getCheckoutById(map.id, id);
    return NextResponse.json({
      ...result,
      checkout: refreshed ? serializeCheckoutResponse(refreshed) : null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Godkännande misslyckades" },
      { status: 400 },
    );
  }
}
