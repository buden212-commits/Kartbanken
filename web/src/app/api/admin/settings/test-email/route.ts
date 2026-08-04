import { requireAdmin } from "@/lib/auth/api";
import {
  getAdminNotificationEmail,
  isEmailConfigured,
  sendTestEmail,
} from "@/lib/email";
import { NextResponse } from "next/server";

export async function POST() {
  const session = await requireAdmin();
  if (session instanceof NextResponse) {
    return session;
  }

  if (!(await isEmailConfigured())) {
    return NextResponse.json(
      { error: "SMTP är inte konfigurerat. Aktivera inställningar eller sätt .env." },
      { status: 400 },
    );
  }

  const to = await getAdminNotificationEmail();
  if (!to) {
    return NextResponse.json(
      { error: "Admin-notis e-post saknas. Ange mottagare i inställningarna eller .env." },
      { status: 400 },
    );
  }

  try {
    await sendTestEmail(to);
    return NextResponse.json({
      message: `Testmail skickades till ${to}.`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Kunde inte skicka testmail";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
