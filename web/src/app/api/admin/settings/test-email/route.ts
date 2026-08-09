import { requireAdmin } from "@/lib/auth/api";
import {
  formatSmtpErrorMessage,
  getAdminNotificationEmail,
  isEmailConfigured,
  sendTestEmail,
} from "@/lib/email";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
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

  let withAttachment = false;
  try {
    const body = (await request.json()) as { withAttachment?: boolean };
    withAttachment = body.withAttachment === true;
  } catch {
    // Tom body = vanligt testmail utan bifogning
  }

  try {
    await sendTestEmail(to, { withAttachment, triggeredByUserId: session.user.id });
    return NextResponse.json({
      message: withAttachment
        ? `Testmail med bifogad fil skickades till ${to}.`
        : `Testmail skickades till ${to}.`,
    });
  } catch (error) {
    return NextResponse.json({ error: formatSmtpErrorMessage(error) }, { status: 500 });
  }
}
