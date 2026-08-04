import { requireSession, type AuthSession } from "@/lib/auth/api";
import {
  canAdminConfirmIntegration,
  canConfirmCheckoutIntegration,
} from "@/lib/auth/permissions";
import type { CheckoutDiffSummary } from "@/lib/checkout/diff-status";
import { parseCheckoutDiffFromRecord } from "@/lib/checkout/diff-status";
import { getCheckoutById } from "@/lib/checkout/repository";
import { prisma } from "@/lib/prisma";
import { readStoredFile } from "@/lib/storage";
import { NextResponse } from "next/server";

export const maxDuration = 300;

type RouteParams = { params: Promise<{ slug: string; id: string }> };

const VALID_LAYERS = new Set(["added", "removed", "modified"]);

async function loadAuthorizedCheckout(slug: string, id: string, session: AuthSession) {
  const map = await prisma.mapFile.findUnique({ where: { slug }, select: { id: true } });
  if (!map) return { error: NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 }) };

  const checkout = await getCheckoutById(map.id, id);
  if (!checkout) {
    return { error: NextResponse.json({ error: "Checkout hittades inte" }, { status: 404 }) };
  }

  const canView =
    canAdminConfirmIntegration(session.user.role) ||
    canConfirmCheckoutIntegration(session.user.role, checkout.userId, session.user.id);

  if (!canView) {
    return { error: NextResponse.json({ error: "Ingen behörighet" }, { status: 403 }) };
  }

  return { checkout };
}

export async function GET(request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const { slug, id } = await params;
  const { searchParams } = new URL(request.url);
  const layer = searchParams.get("layer");

  if (!layer || !VALID_LAYERS.has(layer)) {
    return NextResponse.json(
      { error: "Ange layer (added|removed|modified)" },
      { status: 400 },
    );
  }

  const result = await loadAuthorizedCheckout(slug, id, session);
  if ("error" in result && result.error) return result.error;

  const parsed = parseCheckoutDiffFromRecord(result.checkout!);
  if (parsed.status !== "ready") {
    return NextResponse.json({ error: "Diff saknas — vänta tills beräkningen är klar" }, { status: 404 });
  }

  const summary = parsed.summary as CheckoutDiffSummary;
  const storagePath = summary.layerPaths?.[layer as keyof NonNullable<CheckoutDiffSummary["layerPaths"]>];
  if (!storagePath || typeof storagePath !== "string") {
    return NextResponse.json(
      { error: "Kartlager saknas — försök beräkna diff igen" },
      { status: 404 },
    );
  }

  try {
    const svg = await readStoredFile(storagePath);
    return new NextResponse(new Uint8Array(svg), {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Kartlager kunde inte läsas" }, { status: 404 });
  }
}
