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
import { CheckoutMode, CheckoutStatus } from "@/lib/checkout/types";
import { notifyCheckoutIntegrated, queueNotifyAdminOfNewUpload } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const maxDuration = 300;

type RouteParams = { params: Promise<{ slug: string; id: string }> };

async function readReviewedDiff(
  request: Request,
): Promise<{ computedAt?: string; checkinStoragePath?: string }> {
  try {
    const body = (await request.json()) as Record<string, unknown> | null;
    return {
      computedAt: typeof body?.computedAt === "string" ? body.computedAt : undefined,
      checkinStoragePath:
        typeof body?.checkinStoragePath === "string" ? body.checkinStoragePath : undefined,
    };
  } catch {
    return {};
  }
}

export async function POST(request: Request, { params }: RouteParams) {
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

  if (checkout.mode !== CheckoutMode.OCAD_DESKTOP) {
    return NextResponse.json(
      { error: "Fältredigeringar publiceras från fältredigeringssidan" },
      { status: 400 },
    );
  }

  if (checkout.status === CheckoutStatus.INTEGRATING) {
    return NextResponse.json(
      { error: "Integrering pågår redan för den här utcheckningen" },
      { status: 409 },
    );
  }

  if (
    checkout.status !== CheckoutStatus.PENDING_ADMIN_CONFIRM &&
    checkout.status !== CheckoutStatus.CHECKED_IN
  ) {
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
  if (checkout.status === CheckoutStatus.CHECKED_IN && diffStatus.status !== "ready") {
    return NextResponse.json({ error: "Diff saknas för utcheckning" }, { status: 409 });
  }

  const reviewed = await readReviewedDiff(request);
  const reviewOutdated =
    (reviewed.checkinStoragePath &&
      reviewed.checkinStoragePath !== checkout.checkinStoragePath) ||
    (reviewed.computedAt &&
      diffStatus.status === "ready" &&
      diffStatus.summary.computedAt &&
      reviewed.computedAt !== diffStatus.summary.computedAt);
  if (reviewOutdated) {
    return NextResponse.json(
      {
        error:
          "Incheckningen eller diffen har ändrats sedan du granskade den. Ladda om sidan och granska igen.",
      },
      { status: 409 },
    );
  }

  const integratedDirectlyFromCheckin = checkout.status === CheckoutStatus.CHECKED_IN;

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
    const result = await integrateCheckout(checkout.id, {
      expectedCheckinStoragePath: reviewed.checkinStoragePath,
      expectedDiffComputedAt: reviewed.computedAt,
    });

    if (integratedDirectlyFromCheckin) {
      await logAction(session.user.id, "CHECKOUT_USER_CONFIRMED", "MapCheckout", checkout.id, {
        mapSlug: slug,
        byAdmin: true,
      });
    }

    await logAction(session.user.id, "CHECKOUT_INTEGRATED", "MapCheckout", checkout.id, {
      mapSlug: slug,
      versionId: result.versionId,
      versionNumber: result.versionNumber,
      warnings: result.warningMessages,
      deletedObjects: result.deletedObjects,
      copiedObjects: result.copiedObjects,
      replacedObjects: result.replacedObjects,
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
    // Start/conflict errors are expected business outcomes, not server faults.
    const status =
      err instanceof IntegrationError && err.step !== "upload" && err.step !== "post_process"
        ? 409
        : 500;
    return NextResponse.json(payload, { status });
  }
}
