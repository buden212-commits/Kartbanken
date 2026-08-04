import { logAction } from "@/lib/audit";
import { requireSession } from "@/lib/auth/api";
import { canCheckin } from "@/lib/auth/permissions";
import {
  markCheckoutDiffPending,
  scheduleCheckoutSubsetDiff,
} from "@/lib/checkout/diff-status";
import { getCheckoutById, updateCheckoutCheckin } from "@/lib/checkout/repository";
import { CheckoutStatus } from "@/lib/checkout/types";
import { notifyCheckinSubmitted } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import {
  buildCheckoutCheckinPath,
  deleteFile,
  shouldUseClientUpload,
  uploadFile,
  validateOcdUpload,
} from "@/lib/storage";
import { NextResponse } from "next/server";

export const maxDuration = 300;

type RouteParams = { params: Promise<{ slug: string; id: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  if (!canCheckin(session.user.role)) {
    return NextResponse.json({ error: "Ingen behörighet att checka in" }, { status: 403 });
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

  if (checkout.userId !== session.user.id && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Du kan endast checka in egna checkouts" }, { status: 403 });
  }

  if (checkout.status !== CheckoutStatus.ACTIVE && checkout.status !== CheckoutStatus.CHECKED_IN) {
    return NextResponse.json(
      { error: "Checkout accepterar inte checkin i nuvarande status" },
      { status: 400 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Ogiltig uppladdning" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Ingen fil uppladdad" }, { status: 400 });
  }

  const integrationComment = formData.get("comment")?.toString().trim() || null;

  const validation = validateOcdUpload(file.name, file.size);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  if (shouldUseClientUpload(file.size)) {
    return NextResponse.json(
      {
        error: "Filen är för stor för direktuppladdning. Använd upload-init/upload-complete.",
        clientUploadRequired: true,
      },
      { status: 413 },
    );
  }

  const storagePath = buildCheckoutCheckinPath(map.id, checkout.id);
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const storedRef = await uploadFile(storagePath, buffer);

    if (checkout.checkinStoragePath) {
      await deleteFile(checkout.checkinStoragePath).catch(() => undefined);
    }

    await updateCheckoutCheckin(
      checkout.id,
      storedRef,
      CheckoutStatus.CHECKED_IN,
      integrationComment,
    );
    await markCheckoutDiffPending(checkout.id);

    await logAction(session.user.id, "CHECKIN_SUBMITTED", "MapCheckout", checkout.id, {
      mapSlug: slug,
      filename: file.name,
    });

    notifyCheckinSubmitted({
      checkoutId: checkout.id,
      map: { title: map.title, slug: map.slug },
      owner: { name: checkout.user.name, email: checkout.user.email },
      checkin: { storagePath: storedRef, filename: file.name },
    });

    scheduleCheckoutSubsetDiff(checkout.id);

    return NextResponse.json({ ok: true, status: CheckoutStatus.CHECKED_IN });
  } catch (err) {
    await deleteFile(storagePath).catch(() => undefined);
    console.error("Checkin upload failed:", err);
    return NextResponse.json({ error: "Checkin misslyckades" }, { status: 500 });
  }
}
