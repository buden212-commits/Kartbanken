import { requireFieldEdit } from "@/lib/auth/api";
import { getCheckoutById, serializeCheckoutResponse } from "@/lib/checkout/repository";
import { CheckoutMode, CheckoutStatus } from "@/lib/checkout/types";
import { validateFieldEditOps } from "@/lib/field-edit/apply-ops";
import { buildFieldEditReviewSummary } from "@/lib/field-edit/review-summary";
import {
  parseFieldEditOps,
  serializeFieldEditOps,
  type FieldEditOps,
} from "@/lib/field-edit/types";
import { logAction } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { readStoredFile } from "@/lib/storage";
import { NextResponse } from "next/server";

export const maxDuration = 300;

type RouteParams = { params: Promise<{ slug: string; id: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const session = await requireFieldEdit();
  if (session instanceof NextResponse) return session;

  const { slug, id } = await params;
  const map = await prisma.mapFile.findUnique({ where: { slug }, select: { id: true, title: true } });
  if (!map) {
    return NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 });
  }

  const checkout = await getCheckoutById(map.id, id);
  if (!checkout || checkout.mode !== CheckoutMode.FIELD_EDIT) {
    return NextResponse.json({ error: "Fältredigering hittades inte" }, { status: 404 });
  }
  if (checkout.status !== CheckoutStatus.ACTIVE) {
    return NextResponse.json({ error: "Endast aktiva fältredigeringar kan skickas in" }, { status: 409 });
  }
  if (checkout.userId !== session.user.id) {
    const { canAdmin } = await import("@/lib/auth/permissions");
    if (!canAdmin(session.user.role)) {
      return NextResponse.json({ error: "Endast ägaren kan skicka in fältredigeringen" }, { status: 403 });
    }
  }

  let ops: FieldEditOps = parseFieldEditOps(checkout.editOpsJson);
  let comment: string | null = null;
  try {
    const body = await request.json();
    if (body && typeof body === "object") {
      const record = body as Record<string, unknown>;
      if (record.ops && typeof record.ops === "object") {
        ops = parseFieldEditOps(serializeFieldEditOps(record.ops as never));
      }
      if (typeof record.comment === "string") {
        comment = record.comment.trim() || null;
      }
    }
  } catch {
    // optional body
  }

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
    ops,
  );
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const summary = buildFieldEditReviewSummary(ops);

  await prisma.mapCheckout.update({
    where: { id: id },
    data: {
      status: CheckoutStatus.PENDING_ADMIN_CONFIRM,
      userConfirmedAt: new Date(),
      editOpsJson: serializeFieldEditOps(ops),
      diffSummaryJson: JSON.stringify(summary),
      integrationComment: comment,
    },
  });

  await logAction(session.user.id, "FIELD_EDIT_SUBMITTED", "MapCheckout", id, {
    mapSlug: slug,
    deletes: summary.deletes,
    adds: summary.adds,
    modifies: summary.modifies,
  });

  const refreshed = await getCheckoutById(map.id, id);
  return NextResponse.json({
    ok: true,
    summary,
    checkout: refreshed ? serializeCheckoutResponse(refreshed) : null,
  });
}
