import { requireSession } from "@/lib/auth/api";
import { canCheckout, canViewCheckouts } from "@/lib/auth/permissions";
import { detectCheckoutConflicts } from "@/lib/checkout/overlap";
import {
  findActiveAreaLocksForMap,
  findActiveOverlapCandidates,
  getCheckoutById,
  getHeadVersionId,
  serializeCheckoutResponse,
} from "@/lib/checkout/repository";
import {
  CheckoutConflictError,
  CheckoutValidationError,
  createCheckoutWithExport,
  finalizeCheckoutNotifications,
  parseSelectionPayload,
  runAfterResponse,
} from "@/lib/checkout/create-checkout";
import { CheckoutSelectionType } from "@/lib/checkout/types";
import { HeadVersionChangedError } from "@/lib/maps/head-version";
import { parseOcadExportVersion } from "@/lib/ocad/ocad-export-shared";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const maxDuration = 300;

type RouteParams = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  if (!canViewCheckouts(session.user.role)) {
    return NextResponse.json({ error: "Ingen behörighet att visa utcheckningar" }, { status: 403 });
  }

  const { slug } = await params;
  const map = await prisma.mapFile.findUnique({ where: { slug }, select: { id: true } });
  if (!map) {
    return NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 });
  }

  const checkouts = await findActiveAreaLocksForMap(map.id);
  return NextResponse.json({
    checkouts: checkouts.map(serializeCheckoutResponse),
  });
}

export async function POST(request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  if (!canCheckout(session.user.role)) {
    return NextResponse.json({ error: "Endast redaktörer kan checka ut områden" }, { status: 403 });
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
    return NextResponse.json({ error: "Arkiverat område kan inte checkas ut" }, { status: 403 });
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

  const exportOcadVersion = parseOcadExportVersion(record.ocadVersion);
  if (!exportOcadVersion) {
    return NextResponse.json({ error: "Ogiltigt OCAD-format för utcheckning" }, { status: 400 });
  }

  const headVersionId = await getHeadVersionId(map.id);
  if (!headVersionId) {
    return NextResponse.json(
      { error: "Kartfilen saknar version att checka ut från" },
      { status: 400 },
    );
  }

  // Cheap early rejection on geometry; the authoritative check (with server objectIds)
  // runs under the map lock inside createCheckoutWithExport.
  const earlyConflicts = detectCheckoutConflicts(
    parsedSelection,
    await findActiveOverlapCandidates(map.id),
  );
  if (earlyConflicts.length > 0) {
    return NextResponse.json(
      { error: "Området överlappar en befintlig utcheckning", conflicts: earlyConflicts },
      { status: 409 },
    );
  }

  let checkout: Awaited<ReturnType<typeof createCheckoutWithExport>>;
  try {
    checkout = await createCheckoutWithExport({
      mapFileId: map.id,
      baseVersionId: headVersionId,
      userId: session.user.id,
      selectionType,
      selection: parsedSelection,
      exportOcadVersion,
    });
  } catch (err) {
    if (err instanceof CheckoutValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof CheckoutConflictError) {
      return NextResponse.json({ error: err.message, conflicts: err.conflicts }, { status: 409 });
    }
    if (err instanceof HeadVersionChangedError) {
      return NextResponse.json(
        { error: "Kartan fick en ny version under tiden. Försök checka ut igen." },
        { status: 409 },
      );
    }
    console.error("Checkout export failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Subset-export misslyckades" },
      { status: 500 },
    );
  }

  const refreshed = await getCheckoutById(map.id, checkout.id);

  runAfterResponse(async () => {
    await finalizeCheckoutNotifications(refreshed ?? checkout, map, session.user.id);
  });

  return NextResponse.json(serializeCheckoutResponse(refreshed ?? checkout), { status: 201 });
}
