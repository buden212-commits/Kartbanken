import { requireSession } from "@/lib/auth/api";
import { canFieldEdit } from "@/lib/auth/permissions";
import { parseSelectionPayload } from "@/lib/checkout/create-checkout";
import { detectCheckoutConflicts } from "@/lib/checkout/overlap";
import {
  validateFieldEditArea,
  formatAreaKm2,
  selectionAreaM2,
} from "@/lib/checkout/selection-area";
import {
  createCheckout,
  findActiveFieldEditsForMap,
  findActiveOverlapCandidates,
  getCheckoutById,
  getHeadVersionId,
  serializeCheckoutResponse,
} from "@/lib/checkout/repository";
import { CheckoutMode, CheckoutSelectionType } from "@/lib/checkout/types";
import { enrichFieldEditSelection } from "@/lib/field-edit/publish";
import { readMapScaleFromBuffer } from "@/lib/field-edit/scale";
import { emptyFieldEditOps, serializeFieldEditOps } from "@/lib/field-edit/types";
import { logAction } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { readStoredFile } from "@/lib/storage";
import { NextResponse } from "next/server";

export const maxDuration = 300;

type RouteParams = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  if (!canFieldEdit(session.user.role)) {
    return NextResponse.json({ error: "Endast administratörer kan använda fältredigering" }, { status: 403 });
  }

  const { slug } = await params;
  const map = await prisma.mapFile.findUnique({ where: { slug }, select: { id: true } });
  if (!map) {
    return NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 });
  }

  const sessions = await findActiveFieldEditsForMap(map.id);
  return NextResponse.json({
    fieldEdits: sessions.map(serializeCheckoutResponse),
  });
}

export async function POST(request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  if (!canFieldEdit(session.user.role)) {
    return NextResponse.json({ error: "Endast administratörer kan använda fältredigering" }, { status: 403 });
  }

  const { slug } = await params;
  const map = await prisma.mapFile.findUnique({
    where: { slug },
    select: { id: true, title: true, slug: true, archivedAt: true },
  });
  if (!map) {
    return NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 });
  }
  if (map.archivedAt) {
    return NextResponse.json({ error: "Arkiverat område kan inte redigeras" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ogiltig JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Ogiltig begäran" }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const selectionType = record.selectionType;
  if (selectionType !== CheckoutSelectionType.BBOX && selectionType !== CheckoutSelectionType.POLYGON) {
    return NextResponse.json(
      { error: "selectionType måste vara BBOX eller POLYGON" },
      { status: 400 },
    );
  }

  const parsedSelection = parseSelectionPayload(selectionType, record.selection);
  if (!parsedSelection) {
    return NextResponse.json({ error: "Ogiltigt urval (selection)" }, { status: 400 });
  }

  const headVersionId = await getHeadVersionId(map.id);
  if (!headVersionId) {
    return NextResponse.json({ error: "Kartfilen saknar version att redigera från" }, { status: 400 });
  }

  const headVersion = await prisma.mapVersion.findUnique({
    where: { id: headVersionId },
    select: { storagePath: true, originalFilename: true },
  });
  if (!headVersion) {
    return NextResponse.json({ error: "Aktuell version hittades inte" }, { status: 404 });
  }

  const headBuffer = await readStoredFile(headVersion.storagePath);
  const mapScale = await readMapScaleFromBuffer(headBuffer);
  const areaError = validateFieldEditArea(parsedSelection.geometry, mapScale);
  if (areaError) {
    return NextResponse.json({ error: areaError }, { status: 400 });
  }

  const activeCheckouts = await findActiveOverlapCandidates(map.id);
  const conflicts = detectCheckoutConflicts(parsedSelection, activeCheckouts);
  if (conflicts.length > 0) {
    return NextResponse.json(
      {
        error: "Området överlappar en befintlig utcheckning eller fältredigering",
        conflicts,
      },
      { status: 409 },
    );
  }

  const checkout = await createCheckout({
    mapFileId: map.id,
    baseVersionId: headVersionId,
    userId: session.user.id,
    selectionType,
    selection: parsedSelection,
    mode: CheckoutMode.FIELD_EDIT,
    editOpsJson: serializeFieldEditOps(emptyFieldEditOps()),
  });

  const enrichedSelectionJson = await enrichFieldEditSelection(
    map.id,
    headVersionId,
    checkout.selectionJson,
  );

  await prisma.mapCheckout.update({
    where: { id: checkout.id },
    data: { selectionJson: enrichedSelectionJson },
  });

  await logAction(session.user.id, "FIELD_EDIT_CREATED", "MapCheckout", checkout.id, {
    mapSlug: map.slug,
    areaKm2: formatAreaKm2(selectionAreaM2(parsedSelection.geometry, mapScale)),
  });

  const refreshed = await getCheckoutById(map.id, checkout.id);
  return NextResponse.json(serializeCheckoutResponse(refreshed ?? checkout), { status: 201 });
}
