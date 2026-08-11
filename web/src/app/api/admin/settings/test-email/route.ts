import { requireAdmin } from "@/lib/auth/api";
import {
  formatSmtpErrorMessage,
  isEmailConfigured,
  sendTestEmail,
} from "@/lib/email";
import { resolveAdminNotificationEmails } from "@/lib/settings/app-settings";
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

  const recipients = await resolveAdminNotificationEmails();
  if (recipients.length === 0) {
    return NextResponse.json(
      { error: "Admin-notis e-post saknas. Ange minst en mottagare i inställningarna eller .env." },
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
    for (const to of recipients) {
      await sendTestEmail(to, { withAttachment, triggeredByUserId: session.user.id });
    }

    const recipientList = recipients.join(", ");
    return NextResponse.json({
      message: withAttachment
        ? `Testmail med bifogad fil skickades till ${recipientList}.`
        : `Testmail skickades till ${recipientList}.`,
    });
  } catch (error) {
    return NextResponse.json({ error: formatSmtpErrorMessage(error) }, { status: 500 });
  }
}
