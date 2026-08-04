import { logAction } from "@/lib/audit";
import { requireSession } from "@/lib/auth/api";
import { canAdminConfirmIntegration } from "@/lib/auth/permissions";
import { integrateCheckout } from "@/lib/checkout/integrate";
import { getCheckoutById } from "@/lib/checkout/repository";
import { CheckoutStatus } from "@/lib/checkout/types";
import { notifyAdminOfNewUpload, notifyCheckoutIntegrated } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const maxDuration = 300;

type RouteParams = { params: Promise<{ slug: string; id: string }> };

export async function POST(_request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  if (!canAdminConfirmIntegration(session.user.role)) {
    return NextResponse.json({ error: "Endast admin kan integrera checkouts" }, { status: 403 });
  }

  const { slug, id } = await params;
  const map = await prisma.mapFile.findUnique({
    where: { slug },
    select: { id: true, title: true, slug: true },
  });
  if (!map) {
    return NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 });
  }

  const checkout = await getCheckoutById(map.id, id);
  if (!checkout) {
    return NextResponse.json({ error: "Checkout hittades inte" }, { status: 404 });
  }

  if (checkout.status !== CheckoutStatus.PENDING_ADMIN_CONFIRM) {
    return NextResponse.json(
      { error: "Checkout väntar inte på admin-bekräftelse" },
      { status: 400 },
    );
  }

  try {
    const result = await integrateCheckout(checkout.id, session.user.id);

    await logAction(session.user.id, "CHECKOUT_INTEGRATED", "MapCheckout", checkout.id, {
      mapSlug: slug,
      versionId: result.versionId,
      versionNumber: result.versionNumber,
      warnings: result.warningMessages,
    });

    notifyCheckoutIntegrated({
      checkoutId: checkout.id,
      map: { title: map.title, slug: map.slug },
      owner: { name: checkout.user.name, email: checkout.user.email },
      versionNumber: result.versionNumber,
    });

    const integratedVersion = await prisma.mapVersion.findUnique({
      where: { id: result.versionId },
      select: {
        id: true,
        versionNumber: true,
        originalFilename: true,
        comment: true,
        storagePath: true,
      },
    });

    if (integratedVersion) {
      void notifyAdminOfNewUpload({
        uploader: { name: session.user.name, email: session.user.email },
        map: { title: map.title, slug: map.slug },
        version: integratedVersion,
      }).catch((err) => {
        console.error("[email] Failed to send integration upload notification:", err);
      });
    }

    return NextResponse.json({
      ok: true,
      status: CheckoutStatus.INTEGRATED,
      versionId: result.versionId,
      versionNumber: result.versionNumber,
      warnings: result.warnings,
      warningMessages: result.warningMessages,
    });
  } catch (err) {
    console.error("Checkout integration failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Integration misslyckades" },
      { status: 500 },
    );
  }
}
