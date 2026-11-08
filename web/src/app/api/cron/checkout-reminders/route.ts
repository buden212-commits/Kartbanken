import { logAction } from "@/lib/audit";
import {
  findCheckoutsNeedingReminder,
  markReminderSent,
} from "@/lib/checkout/repository";
import { CheckoutStatus } from "@/lib/checkout/types";
import { runCheckoutMaintenance } from "@/lib/checkout/maintenance";
import {
  notifyCheckoutAwaitingIntegrationReminder,
  notifyCheckoutReminder,
} from "@/lib/email";
import { prisma } from "@/lib/prisma";
import {
  resolveCheckoutReminderDays,
  resolveCheckoutReminderRepeatDays,
} from "@/lib/settings/app-settings";
import { NextResponse } from "next/server";

export const maxDuration = 120;

function isAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    // Fail closed i alla deployade miljöer; tillåt endast lokal development utan secret.
    return process.env.NODE_ENV === "development" && !process.env.VERCEL;
  }
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${cronSecret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reminderDays = await resolveCheckoutReminderDays();
  const repeatDays = await resolveCheckoutReminderRepeatDays();
  const initialCutoff = new Date(Date.now() - reminderDays * 24 * 60 * 60 * 1000);
  const repeatCutoff = new Date(Date.now() - repeatDays * 24 * 60 * 60 * 1000);
  const checkouts = await findCheckoutsNeedingReminder(initialCutoff, repeatCutoff);

  const maintenance = await runCheckoutMaintenance();

  let sent = 0;

  for (const checkout of checkouts) {
    const map = await prisma.mapFile.findUnique({
      where: { id: checkout.mapFileId },
      select: { title: true, slug: true },
    });
    if (!map) continue;

    const isRepeat = checkout.reminderSentAt != null;

    // Mark first: a timeout after sending must not cause duplicate emails next run.
    await markReminderSent(checkout.id);

    if (
      checkout.status === CheckoutStatus.PENDING_ADMIN_CONFIRM ||
      checkout.status === CheckoutStatus.CHECKED_IN
    ) {
      notifyCheckoutAwaitingIntegrationReminder({
        checkoutId: checkout.id,
        map: { title: map.title, slug: map.slug },
        owner: { name: checkout.user.name, email: checkout.user.email },
        days: reminderDays,
        userConfirmed: checkout.status === CheckoutStatus.PENDING_ADMIN_CONFIRM,
      });
    } else {
      notifyCheckoutReminder({
        checkoutId: checkout.id,
        map: { title: map.title, slug: map.slug },
        owner: { name: checkout.user.name, email: checkout.user.email },
        days: reminderDays,
        isRepeat,
      });
    }

    await logAction(null, "CHECKOUT_REMINDER_SENT", "MapCheckout", checkout.id, {
      mapSlug: map.slug,
      days: reminderDays,
      repeatDays,
      isRepeat,
    });
    sent++;
  }

  return NextResponse.json({ ok: true, sent, reminderDays, repeatDays, maintenance });
}
