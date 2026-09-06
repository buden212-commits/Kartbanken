import { logAction } from "@/lib/audit";
import { requireSession } from "@/lib/auth/api";
import { canAdminConfirmIntegration } from "@/lib/auth/permissions";
import { integrateCheckout } from "@/lib/checkout/integrate";
import { IntegrationError } from "@/lib/checkout/integration-error";
import {
  integrationErrorPayload,
  logIntegrationError,
} from "@/lib/checkout/integration-log";
import {
  parseCheckoutDiffFromRecord,
  parseStoredCheckoutDiffJson,
} from "@/lib/checkout/diff-status";
import { getCheckoutById } from "@/lib/checkout/repository";
import { CheckoutStatus } from "@/lib/checkout/types";
import { notifyCheckoutIntegrated, queueNotifyAdminOfNewUpload } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const maxDuration = 300;

type RouteParams = { params: Promise<{ slug: string; id: string }> };

export async function POST(_request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  if (!canAdminConfirmIntegration(session.user.role)) {
    return NextResponse.json({ error: "Endast admin kan integrera utcheckningar" }, { status: 403 });
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
    return NextResponse.json({ error: "Utcheckning hittades inte" }, { status: 404 });
  }

  if (checkout.status !== CheckoutStatus.PENDING_ADMIN_CONFIRM) {
    return NextResponse.json(
      { error: "Utcheckningen väntar inte på admin-bekräftelse" },
      { status: 400 },
    );
  }

  const diffStatus = parseCheckoutDiffFromRecord(checkout);
  if (diffStatus.status === "pending") {
    return NextResponse.json(
      { error: "Diff beräknas fortfarande — försök igen om en stund" },
      { status: 409 },
    );
  }
  if (diffStatus.status === "error") {
    return NextResponse.json(
      { error: `Diff misslyckades: ${diffStatus.error}` },
      { status: 409 },
    );
  }

  const storedDiff = parseStoredCheckoutDiffJson(checkout.diffSummaryJson);
  if (diffStatus.status === "ready") {
    const summary = diffStatus.summary;
    const hasChangeCounts = summary.added + summary.removed + summary.modified > 0;
    if (hasChangeCounts && !storedDiff) {
      console.error("[checkout-integration]", {
        step: "confirm_admin_precheck",
        checkoutId: checkout.id,
        mapSlug: slug,
        error: "Diff summary exists but changes array is missing",
        added: summary.added,
        removed: summary.removed,
        modified: summary.modified,
      });
      return NextResponse.json(
        {
          error:
            "Diff-data är ofullständig (saknar objektlista). Be användaren ladda om sidan eller beräkna om diff.",
        },
        { status: 409 },
      );
    }
  }

  try {
    const result = await integrateCheckout(checkout.id);

    await logAction(session.user.id, "CHECKOUT_INTEGRATED", "MapCheckout", checkout.id, {
      mapSlug: slug,
      versionId: result.versionId,
      versionNumber: result.versionNumber,
      warnings: result.warningMessages,
      deletedObjects: result.deletedObjects,
      copiedObjects: result.copiedObjects,
      skippedCopies: result.skippedCopies,
      appendedObjects: result.appendedObjects,
    });

    notifyCheckoutIntegrated({
      checkoutId: checkout.id,
      map: { title: map.title, slug: map.slug },
      owner: { name: checkout.user.name, email: checkout.user.email },
      versionNumber: result.versionNumber,
      versionId: result.versionId,
    });

    const integratedVersion = await prisma.mapVersion.findUnique({
      where: { id: result.versionId },
      select: {
        id: true,
        versionNumber: true,
        originalFilename: true,
        comment: true,
        storagePath: true,
        uploadedById: true,
      },
    });

    if (integratedVersion) {
      const uploader = integratedVersion.uploadedById
        ? await prisma.user.findUnique({
            where: { id: integratedVersion.uploadedById },
            select: { name: true, email: true },
          })
        : null;

      queueNotifyAdminOfNewUpload({
        uploader: uploader ?? { name: checkout.user.name, email: checkout.user.email },
        map: { title: map.title, slug: map.slug },
        version: integratedVersion,
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
    const step = err instanceof IntegrationError ? err.step : "persist";
    logIntegrationError(
      step,
      { checkoutId: checkout.id, mapFileId: map.id },
      err,
      { mapSlug: slug, adminUserId: session.user.id },
    );
    const payload = integrationErrorPayload(err, "Integration misslyckades");
    return NextResponse.json(payload, { status: 500 });
  }
}
