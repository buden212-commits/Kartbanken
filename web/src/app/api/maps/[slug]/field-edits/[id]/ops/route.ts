import { requireFieldEdit } from "@/lib/auth/api";
import { getCheckoutById, serializeCheckoutResponse, updateFieldEditOps } from "@/lib/checkout/repository";
import { CheckoutMode, CheckoutStatus } from "@/lib/checkout/types";
import { validateFieldEditOps } from "@/lib/field-edit/apply-ops";
import { mergeFieldEditOps, parseFieldEditOps, serializeFieldEditOps, type FieldEditOps } from "@/lib/field-edit/types";
import { prisma } from "@/lib/prisma";
import { readStoredFile } from "@/lib/storage";
import { NextResponse } from "next/server";

export const maxDuration = 300;

type RouteParams = { params: Promise<{ slug: string; id: string }> };

function parseOpsBody(body: unknown): FieldEditOps | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const current = emptyOpsFromPartial(record);
  return current;
}

function emptyOpsFromPartial(record: Record<string, unknown>): FieldEditOps | null {
  const deletes = record.deletes;
  const adds = record.adds;
  if (deletes != null && !Array.isArray(deletes)) return null;
  if (adds != null && !Array.isArray(adds)) return null;
  return parseFieldEditOps(JSON.stringify({ deletes: deletes ?? [], adds: adds ?? [] }));
}

export async function PATCH(request: Request, { params }: RouteParams) {
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
  if (checkout.status !== CheckoutStatus.ACTIVE) {
    return NextResponse.json({ error: "Fältredigeringen är inte aktiv" }, { status: 409 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ogiltig JSON" }, { status: 400 });
  }

  const incoming = parseOpsBody(body);
  if (!incoming) {
    return NextResponse.json({ error: "Ogiltiga redigeringsoperationer" }, { status: 400 });
  }

  const current = parseFieldEditOps(checkout.editOpsJson);
  const merged = mergeFieldEditOps(current, incoming);

  const headVersion = await prisma.mapVersion.findUnique({
    where: { id: checkout.baseVersionId },
    select: { storagePath: true, originalFilename: true },
  });
  if (!headVersion) {
    return NextResponse.json({ error: "Basversion hittades inte" }, { status: 404 });
  }

  const headBuffer = await readStoredFile(headVersion.storagePath);
  const validationError = await validateFieldEditOps(
    headBuffer,
    headVersion.originalFilename,
    checkout.selectionJson,
    merged,
  );
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const updated = await updateFieldEditOps(checkout.id, serializeFieldEditOps(merged));
  return NextResponse.json(serializeCheckoutResponse(updated));
}
