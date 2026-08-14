import { logAction } from "@/lib/audit";
import {
  findCheckoutsNeedingReminder,
  markReminderSent,
} from "@/lib/checkout/repository";
import { CheckoutStatus } from "@/lib/checkout/types";
import { notifyCheckoutReminder, notifyCheckoutUserConfirmed } from "@/lib/email";
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

  let sent = 0;

  for (const checkout of checkouts) {
    const map = await prisma.mapFile.findUnique({
      where: { id: checkout.mapFileId },
      select: { title: true, slug: true },
    });
    if (!map) continue;

    const isRepeat = checkout.reminderSentAt != null;

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
        days: reminderDays,
        isRepeat,
      });
    }

    await markReminderSent(checkout.id);
    await logAction(null, "CHECKOUT_REMINDER_SENT", "MapCheckout", checkout.id, {
      mapSlug: map.slug,
      days: reminderDays,
      repeatDays,
      isRepeat,
    });
    sent++;
  }

  return NextResponse.json({ ok: true, sent, reminderDays, repeatDays });
}
