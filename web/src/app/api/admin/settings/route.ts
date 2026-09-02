import { logAction } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/api";
import { resetEmailTransport } from "@/lib/email";
import {
  clampReminderDays,
  getSmtpSettingsPublic,
  shouldUpdateSmtpPassword,
  upsertSmtpSettings,
  validateAdminNotificationEmails,
  type SmtpSettingsInput,
} from "@/lib/settings/app-settings";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await requireAdmin();
  if (session instanceof NextResponse) {
    return session;
  }

  const settings = await getSmtpSettingsPublic();
  return NextResponse.json(settings);
}

export async function PUT(request: Request) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) {
    return session;
  }

  let body: Partial<SmtpSettingsInput>;
  try {
    body = (await request.json()) as Partial<SmtpSettingsInput>;
  } catch {
    return NextResponse.json({ error: "Ogiltig JSON" }, { status: 400 });
  }

  const smtpPort = Number(body.smtpPort ?? 587);
  if (!Number.isFinite(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
    return NextResponse.json({ error: "Ogiltig SMTP-port" }, { status: 400 });
  }

  const checkoutReminderDays = clampReminderDays(Number(body.checkoutReminderDays ?? 7));
  const checkoutReminderRepeatDays = clampReminderDays(
    Number(body.checkoutReminderRepeatDays ?? 7),
  );

  const existing = await getSmtpSettingsPublic();
  const enabled = body.enabled === true;

  if (enabled) {
    const smtpUser = body.smtpUser?.trim();
    const hasPassword = existing.hasPassword || shouldUpdateSmtpPassword(body.smtpPass);

    if (!smtpUser) {
      return NextResponse.json(
        { error: "SMTP-användare krävs när e-post är aktiverat" },
        { status: 400 },
      );
    }

    if (!hasPassword) {
      return NextResponse.json(
        { error: "App-lösenord krävs när e-post är aktiverat" },
        { status: 400 },
      );
    }
  }

  try {
    validateAdminNotificationEmails(body.adminNotificationEmail?.trim() || "");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ogiltig admin-notis e-post";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const settings = await upsertSmtpSettings({
      smtpHost: body.smtpHost?.trim() || "smtp.gmail.com",
      smtpPort,
      smtpUser: body.smtpUser?.trim() || "",
      smtpPass: body.smtpPass,
      adminNotificationEmail: body.adminNotificationEmail?.trim() || "",
      checkoutReminderDays,
      checkoutReminderRepeatDays,
      enabled,
    });

    resetEmailTransport();

    await logAction(session.user.id, "SETTINGS_UPDATED", "AppSettings", "smtp", {
      enabled,
      smtpHost: body.smtpHost?.trim() || "smtp.gmail.com",
      smtpPort,
      smtpUser: body.smtpUser?.trim() || "",
      passwordChanged: shouldUpdateSmtpPassword(body.smtpPass),
      checkoutReminderDays,
      checkoutReminderRepeatDays,
    });

    return NextResponse.json(settings);
  } catch (error) {
    console.error("Settings update failed:", error);
    return NextResponse.json({ error: "Kunde inte spara inställningarna" }, { status: 500 });
  }
}
