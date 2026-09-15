import { requireFieldEdit } from "@/lib/auth/api";
import { canAdmin } from "@/lib/auth/permissions";
import { getCheckoutById } from "@/lib/checkout/repository";
import { CheckoutMode, CheckoutStatus } from "@/lib/checkout/types";
import { loadScopedFieldEditObjects } from "@/lib/field-edit/object-index";
import { parseOcadBuffer } from "@/lib/ocad/read";
import { prisma } from "@/lib/prisma";
import { readStoredFile } from "@/lib/storage";
import { NextResponse } from "next/server";

export const maxDuration = 300;

type RouteParams = { params: Promise<{ slug: string; id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const session = await requireFieldEdit();
  if (session instanceof NextResponse) return session;

  const { slug, id } = await params;
  const map = await prisma.mapFile.findUnique({ where: { slug }, select: { id: true } });
  if (!map) {
    return NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 });
  }

  const checkout = await getCheckoutById(map.id, id);
  if (!checkout || checkout.mode !== CheckoutMode.FIELD_EDIT) {
    return NextResponse.json({ error: "Fältredigering hittades inte" }, { status: 404 });
  }
  const isActive = checkout.status === CheckoutStatus.ACTIVE;
  const isPending = checkout.status === CheckoutStatus.PENDING_ADMIN_CONFIRM;
  if (!isActive && !isPending) {
    return NextResponse.json({ error: "Fältredigeringen är inte aktiv" }, { status: 409 });
  }
  if (isPending) {
    const isOwner = checkout.userId === session.user.id;
    if (!canAdmin(session.user.role) && !isOwner) {
      return NextResponse.json({ error: "Ingen behörighet" }, { status: 403 });
    }
  }

  const version = await prisma.mapVersion.findUnique({
    where: { id: checkout.baseVersionId },
    select: { storagePath: true, originalFilename: true },
  });
  if (!version) {
    return NextResponse.json({ error: "Basversion hittades inte" }, { status: 404 });
  }

  const buffer = await readStoredFile(version.storagePath);
  const parsed = await parseOcadBuffer(buffer, version.originalFilename);
  const objects = loadScopedFieldEditObjects(parsed.objects, checkout.selectionJson);

  return NextResponse.json(
    { objects, count: objects.length },
    { headers: { "Cache-Control": "private, max-age=300" } },
  );
}
