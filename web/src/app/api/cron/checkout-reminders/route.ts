import { logAction } from "@/lib/audit";
import {
  findCheckoutsNeedingReminder,
  markReminderSent,
} from "@/lib/checkout/repository";
import { CheckoutStatus } from "@/lib/checkout/types";
import { notifyCheckoutReminder, notifyCheckoutUserConfirmed } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const maxDuration = 120;

function getReminderDays(): number {
  const raw = Number(process.env.CHECKOUT_REMINDER_DAYS ?? 7);
  return Number.isFinite(raw) && raw > 0 ? raw : 7;
}

function isAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return process.env.NODE_ENV !== "production";
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${cronSecret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const days = getReminderDays();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const checkouts = await findCheckoutsNeedingReminder(cutoff);

  let sent = 0;

  for (const checkout of checkouts) {
    const map = await prisma.mapFile.findUnique({
      where: { id: checkout.mapFileId },
      select: { title: true, slug: true },
    });
    if (!map) continue;

    if (checkout.status === CheckoutStatus.PENDING_ADMIN_CONFIRM) {
      notifyCheckoutUserConfirmed({
        checkoutId: checkout.id,
        map: { title: map.title, slug: map.slug },
        owner: { name: checkout.user.name, email: checkout.user.email },
      });
    } else {
      notifyCheckoutReminder({
        checkoutId: checkout.id,
        map: { title: map.title, slug: map.slug },
        owner: { name: checkout.user.name, email: checkout.user.email },
        days,
      });
    }

    await markReminderSent(checkout.id);
    await logAction(null, "CHECKOUT_REMINDER_SENT", "MapCheckout", checkout.id, {
      mapSlug: map.slug,
      days,
    });
    sent++;
  }

  return NextResponse.json({ ok: true, sent, days });
}
