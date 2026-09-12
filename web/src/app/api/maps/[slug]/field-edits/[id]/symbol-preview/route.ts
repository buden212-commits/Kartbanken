import { requireFieldEdit } from "@/lib/auth/api";
import { canAdmin } from "@/lib/auth/permissions";
import { getCheckoutById } from "@/lib/checkout/repository";
import { CheckoutMode, CheckoutStatus } from "@/lib/checkout/types";
import { buildFieldEditSymbolPreview, type FieldEditDraftPreview } from "@/lib/field-edit/symbol-preview";
import { parseFieldEditOps } from "@/lib/field-edit/types";
import { prisma } from "@/lib/prisma";
import { readStoredFile } from "@/lib/storage";
import { NextResponse } from "next/server";

export const maxDuration = 300;

type RouteParams = { params: Promise<{ slug: string; id: string }> };

function parseDraft(body: Record<string, unknown>): FieldEditDraftPreview | null {
  const draft = body.draft;
  if (!draft || typeof draft !== "object") return null;
  const row = draft as Record<string, unknown>;
  const kind = row.kind;
  const symbolNumber = Number(row.symbolNumber);
  if (kind !== "point" && kind !== "line" && kind !== "area") return null;
  if (!Number.isFinite(symbolNumber)) return null;
  const coordinates = Array.isArray(row.coordinates)
    ? row.coordinates
        .map((value) => {
          if (!Array.isArray(value) || value.length < 2) return null;
          const x = Number(value[0]);
          const y = Number(value[1]);
          if (![x, y].every(Number.isFinite)) return null;
          return [x, y] as [number, number];
        })
        .filter((value): value is [number, number] => value != null)
    : [];
  return { kind, symbolNumber, coordinates };
}

export async function POST(request: Request, { params }: RouteParams) {
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
  if (!checkout.exportStoragePath) {
    return NextResponse.json({ error: "Delkarta saknas" }, { status: 404 });
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
  // Pending review always uses stored ops — do not trust client-supplied edits.
  const ops = isPending
    ? parseFieldEditOps(checkout.editOpsJson)
    : parseFieldEditOps(JSON.stringify(record.ops ?? {}));

  const draft = isPending ? null : parseDraft(record);

  try {
    const subsetBuffer = await readStoredFile(checkout.exportStoragePath);
    const preview = await buildFieldEditSymbolPreview(subsetBuffer, ops, draft);
    if (!preview) {
      return NextResponse.json({ svgInner: "", maskedIndices: [] });
    }
    return NextResponse.json(preview);
  } catch (err) {
    console.error("Field edit symbol preview failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kunde inte rendera symbolförhandsvisning" },
      { status: 500 },
    );
  }
}
