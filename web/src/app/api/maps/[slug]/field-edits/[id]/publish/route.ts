import { requireSession } from "@/lib/auth/api";
import { canFieldEdit } from "@/lib/auth/permissions";
import { getCheckoutById, serializeCheckoutResponse } from "@/lib/checkout/repository";
import { CheckoutMode } from "@/lib/checkout/types";
import { publishFieldEditSession } from "@/lib/field-edit/publish";
import { parseFieldEditOps, serializeFieldEditOps } from "@/lib/field-edit/types";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const maxDuration = 300;

type RouteParams = { params: Promise<{ slug: string; id: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  if (!canFieldEdit(session.user.role)) {
    return NextResponse.json({ error: "Endast administratörer kan använda fältredigering" }, { status: 403 });
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

  let publish = false;
  let comment: string | null = null;
  let opsOverride = undefined;
  try {
    const body = await request.json();
    if (body && typeof body === "object") {
      const record = body as Record<string, unknown>;
      publish = record.publish === true;
      if (typeof record.comment === "string") {
        comment = record.comment.trim() || null;
      }
      if (record.ops && typeof record.ops === "object") {
        opsOverride = parseFieldEditOps(serializeFieldEditOps(record.ops as never));
      }
    }
  } catch {
    // optional body
  }

  try {
    const result = await publishFieldEditSession(id, session.user.id, {
      publish,
      comment,
      ops: opsOverride,
    });
    const refreshed = await getCheckoutById(map.id, id);
    return NextResponse.json({
      ...result,
      checkout: refreshed ? serializeCheckoutResponse(refreshed) : null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Publicering misslyckades" },
      { status: 400 },
    );
  }
}
