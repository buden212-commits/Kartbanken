import { requireSession, type AuthSession } from "@/lib/auth/api";
import {
  canAdminConfirmIntegration,
  canConfirmCheckoutIntegration,
} from "@/lib/auth/permissions";
import { getCheckoutById } from "@/lib/checkout/repository";
import {
  CHECKOUT_DIFF_STALE_MESSAGE,
  isCheckoutDiffStale,
  markCheckoutDiffPending,
  parseCheckoutDiffFromRecord,
  runCheckoutSubsetDiffJob,
  storeCheckoutDiffError,
} from "@/lib/checkout/diff-status";
import { CheckoutStatus } from "@/lib/checkout/types";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

/** Inline beräkning på POST — undvik after() som dör tyst på Vercel. */
export const maxDuration = 300;

type RouteParams = { params: Promise<{ slug: string; id: string }> };

async function loadAuthorizedCheckout(slug: string, id: string, session: AuthSession) {
  const map = await prisma.mapFile.findUnique({ where: { slug }, select: { id: true } });
  if (!map) return { error: NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 }) };

  const checkout = await getCheckoutById(map.id, id);
  if (!checkout) {
    return { error: NextResponse.json({ error: "Utcheckning hittades inte" }, { status: 404 }) };
  }

  const canView =
    canAdminConfirmIntegration(session.user.role) ||
    canConfirmCheckoutIntegration(session.user.role, checkout.userId, session.user.id);

  if (!canView) {
    return { error: NextResponse.json({ error: "Ingen behörighet" }, { status: 403 }) };
  }

  return { checkout };
}

function buildDiffResponse(checkout: NonNullable<Awaited<ReturnType<typeof getCheckoutById>>>) {
  const parsed = parseCheckoutDiffFromRecord(checkout);

  if (parsed.status === "not_applicable") {
    return NextResponse.json({ status: "not_applicable" });
  }

  if (parsed.status === "ready") {
    return NextResponse.json({
      status: "ready",
      objectCount: parsed.objectCount,
      summary: parsed.summary,
    });
  }

  if (parsed.status === "error") {
    return NextResponse.json({
      status: "error",
      objectCount: parsed.objectCount,
      error: parsed.error,
      failedAt: parsed.failedAt,
    });
  }

  return NextResponse.json({
    status: "pending",
    objectCount: parsed.objectCount,
    startedAt: parsed.startedAt,
  });
}

/** Endast status — tung beräkning körs via POST så pollar inte staplar långa anrop. */
export async function GET(_request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const { slug, id } = await params;
  const result = await loadAuthorizedCheckout(slug, id, session);
  if ("error" in result && result.error) return result.error;

  let checkout = result.checkout!;
  const parsed = parseCheckoutDiffFromRecord(checkout);

  if (
    checkout.status === CheckoutStatus.CHECKED_IN &&
    checkout.checkinStoragePath &&
    parsed.status === "pending" &&
    isCheckoutDiffStale(parsed)
  ) {
    await storeCheckoutDiffError(checkout.id, new Error(CHECKOUT_DIFF_STALE_MESSAGE));
    checkout = (await getCheckoutById(checkout.mapFileId, checkout.id)) ?? checkout;
  }

  return buildDiffResponse(checkout);
}

export async function POST(request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const { slug, id } = await params;
  const result = await loadAuthorizedCheckout(slug, id, session);
  if ("error" in result && result.error) return result.error;

  const checkout = result.checkout!;

  if (checkout.status !== CheckoutStatus.CHECKED_IN || !checkout.checkinStoragePath) {
    return NextResponse.json(
      { error: "Diff kan endast beräknas efter incheckning" },
      { status: 400 },
    );
  }

  let force = true;
  try {
    const body = (await request.json()) as { force?: boolean };
    if (body && typeof body.force === "boolean") force = body.force;
  } catch {
    // Tom body = manuell omstart → tvinga omberäkning.
  }

  const parsed = parseCheckoutDiffFromRecord(checkout);
  if (!force && parsed.status === "ready") {
    return buildDiffResponse(checkout);
  }

  if (force || parsed.status === "error" || parsed.status === "pending") {
    if (force || parsed.status === "error") {
      await markCheckoutDiffPending(checkout.id);
    }
    await runCheckoutSubsetDiffJob(checkout.id);
  }

  const refreshed = await getCheckoutById(checkout.mapFileId, checkout.id);
  return buildDiffResponse(refreshed ?? checkout);
}
