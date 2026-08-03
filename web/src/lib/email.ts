import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { getAppBaseUrl } from "@/lib/app-url";
import {
  resolveAdminNotificationEmail,
  resolveSmtpConfig,
  type SmtpConfig,
} from "@/lib/settings/app-settings";

const APP_NAME = "IFK Mora Kartor";

type SendMailOptions = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

let transporter: Transporter | null | undefined;
let cachedConfigKey: string | null | undefined;

function configCacheKey(config: SmtpConfig | null): string | null {
  if (!config) {
    return null;
  }

  return `${config.host}:${config.port}:${config.user}:${config.pass}`;
}

export function resetEmailTransport(): void {
  transporter = undefined;
  cachedConfigKey = undefined;
}

async function getTransporter(): Promise<Transporter | null> {
  const config = await resolveSmtpConfig();
  const nextKey = configCacheKey(config);

  if (transporter !== undefined && cachedConfigKey === nextKey) {
    return transporter;
  }

  cachedConfigKey = nextKey;

  if (!config) {
    transporter = null;
    return null;
  }

  transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  return transporter;
}

export async function isEmailConfigured(): Promise<boolean> {
  const config = await resolveSmtpConfig();
  return config !== null;
}

export async function getAdminNotificationEmail(): Promise<string | null> {
  return resolveAdminNotificationEmail();
}

function formatFromAddress(smtpUser: string): string {
  return `"${APP_NAME}" <${smtpUser}>`;
}

async function resolveReplyToAddress(smtpUser: string): Promise<string> {
  const adminEmail = await resolveAdminNotificationEmail();
  return adminEmail?.trim() || smtpUser;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHtmlEmail(options: {
  title: string;
  bodyHtml: string;
  footerNote?: string;
}): string {
  const baseUrl = getAppBaseUrl();
  const displayUrl = baseUrl.replace(/^https?:\/\//, "");

  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(options.title)}</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:16px;line-height:1.5;color:#1e293b;background-color:#f8fafc;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f8fafc;padding:24px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:8px;">
          <tr>
            <td style="padding:24px 28px;border-bottom:1px solid #e2e8f0;">
              <p style="margin:0;font-size:18px;font-weight:600;color:#0f172a;">${escapeHtml(APP_NAME)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px;">
              ${options.bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;border-top:1px solid #e2e8f0;font-size:13px;color:#64748b;">
              ${
                options.footerNote ??
                `Detta meddelande skickades från <a href="${escapeHtml(baseUrl)}" style="color:#2563eb;text-decoration:none;">${escapeHtml(displayUrl)}</a>.`
              }
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendMail(options: SendMailOptions): Promise<void> {
  const config = await resolveSmtpConfig();
  const transport = await getTransporter();

  if (!transport || !config) {
    console.warn("[email] SMTP not configured — skipping email send");
    return;
  }

  const replyTo = await resolveReplyToAddress(config.user);

  await transport.sendMail({
    from: formatFromAddress(config.user),
    replyTo,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
    headers: {
      "Content-Language": "sv",
      "X-Mailer": APP_NAME,
    },
  });
}

export async function sendTestEmail(to: string): Promise<void> {
  const baseUrl = getAppBaseUrl();
  const subject = `Testmail — ${APP_NAME}`;
  const text = [
    `Detta är ett testmail från ${APP_NAME}.`,
    "",
    "Om du läser detta fungerar SMTP-inställningarna.",
    "",
    `Webbplats: ${baseUrl}`,
  ].join("\n");

  const bodyHtml = `
    <p style="margin:0 0 16px;">Detta är ett testmail från ${escapeHtml(APP_NAME)}.</p>
    <p style="margin:0 0 16px;">Om du läser detta fungerar SMTP-inställningarna.</p>
    <p style="margin:0;">
      <a href="${escapeHtml(baseUrl)}" style="color:#2563eb;text-decoration:none;">${escapeHtml(baseUrl.replace(/^https?:\/\//, ""))}</a>
    </p>
  `.trim();

  const html = buildHtmlEmail({
    title: subject,
    bodyHtml,
  });

  await sendMail({ to, subject, text, html });
}

export async function notifyAdminOfNewRegistration(user: {
  name: string;
  email: string;
}): Promise<void> {
  const adminEmail = await getAdminNotificationEmail();
  if (!adminEmail) {
    console.warn(
      "[email] ADMIN_NOTIFICATION_EMAIL or INITIAL_ADMIN_EMAIL not set — skipping new user notification",
    );
    return;
  }

  if (!(await isEmailConfigured())) {
    console.warn("[email] SMTP not configured — skipping new user notification");
    return;
  }

  const adminUsersUrl = `${getAppBaseUrl()}/admin/users`;
  const subject = `Ny användare väntar på godkännande — ${APP_NAME}`;
  const text = [
    `En ny användare har registrerat sig på ${APP_NAME} och väntar på godkännande.`,
    "",
    `Namn: ${user.name}`,
    `E-post: ${user.email}`,
    "",
    `Godkänn användaren här: ${adminUsersUrl}`,
  ].join("\n");

  const bodyHtml = `
    <p style="margin:0 0 16px;">En ny användare har registrerat sig och väntar på godkännande.</p>
    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 20px;width:100%;font-size:15px;">
      <tr>
        <td style="padding:4px 12px 4px 0;color:#64748b;vertical-align:top;width:80px;">Namn</td>
        <td style="padding:4px 0;color:#0f172a;">${escapeHtml(user.name)}</td>
      </tr>
      <tr>
        <td style="padding:4px 12px 4px 0;color:#64748b;vertical-align:top;">E-post</td>
        <td style="padding:4px 0;color:#0f172a;">${escapeHtml(user.email)}</td>
      </tr>
    </table>
    <p style="margin:0;">
      <a href="${escapeHtml(adminUsersUrl)}" style="display:inline-block;padding:10px 18px;background-color:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:500;">Öppna användarhantering</a>
    </p>
  `.trim();

  const html = buildHtmlEmail({
    title: subject,
    bodyHtml,
  });

  await sendMail({ to: adminEmail, subject, text, html });
}

export async function notifyAdminOfNewUpload(upload: {
  uploader: { name: string | null | undefined; email: string };
  map: { title: string; slug: string };
  version: {
    id: string;
    versionNumber: number;
    originalFilename: string;
    comment?: string | null;
  };
}): Promise<void> {
  const adminEmail = await getAdminNotificationEmail();
  if (!adminEmail) {
    console.warn(
      "[email] ADMIN_NOTIFICATION_EMAIL or INITIAL_ADMIN_EMAIL not set — skipping upload notification",
    );
    return;
  }

  if (!(await isEmailConfigured())) {
    console.warn("[email] SMTP not configured — skipping upload notification");
    return;
  }

  const uploaderName = upload.uploader.name?.trim() || upload.uploader.email;
  const mapUrl = `${getAppBaseUrl()}/maps/${upload.map.slug}`;
  const versionUrl = `${mapUrl}/versions/${upload.version.id}`;
  const subject = `Ny kartversion uppladdad — ${APP_NAME}`;

  const textLines = [
    `En ny kartversion har laddats upp på ${APP_NAME}.`,
    "",
    `Uppladdad av: ${uploaderName}`,
    `E-post: ${upload.uploader.email}`,
    "",
    `Karta: ${upload.map.title}`,
    `Slug: ${upload.map.slug}`,
    `Version: ${upload.version.versionNumber}`,
    `Filnamn: ${upload.version.originalFilename}`,
  ];

  if (upload.version.comment) {
    textLines.push(`Kommentar: ${upload.version.comment}`);
  }

  textLines.push("", `Visa versionen: ${versionUrl}`, `Visa kartan: ${mapUrl}`);

  const text = textLines.join("\n");

  const commentRow = upload.version.comment
    ? `
      <tr>
        <td style="padding:4px 12px 4px 0;color:#64748b;vertical-align:top;">Kommentar</td>
        <td style="padding:4px 0;color:#0f172a;">${escapeHtml(upload.version.comment)}</td>
      </tr>`
    : "";

  const bodyHtml = `
    <p style="margin:0 0 16px;">En ny kartversion har laddats upp.</p>
    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 20px;width:100%;font-size:15px;">
      <tr>
        <td style="padding:4px 12px 4px 0;color:#64748b;vertical-align:top;width:110px;">Uppladdad av</td>
        <td style="padding:4px 0;color:#0f172a;">${escapeHtml(uploaderName)}</td>
      </tr>
      <tr>
        <td style="padding:4px 12px 4px 0;color:#64748b;vertical-align:top;">E-post</td>
        <td style="padding:4px 0;color:#0f172a;">${escapeHtml(upload.uploader.email)}</td>
      </tr>
      <tr>
        <td style="padding:4px 12px 4px 0;color:#64748b;vertical-align:top;">Karta</td>
        <td style="padding:4px 0;color:#0f172a;">${escapeHtml(upload.map.title)}</td>
      </tr>
      <tr>
        <td style="padding:4px 12px 4px 0;color:#64748b;vertical-align:top;">Version</td>
        <td style="padding:4px 0;color:#0f172a;">${upload.version.versionNumber}</td>
      </tr>
      <tr>
        <td style="padding:4px 12px 4px 0;color:#64748b;vertical-align:top;">Filnamn</td>
        <td style="padding:4px 0;color:#0f172a;">${escapeHtml(upload.version.originalFilename)}</td>
      </tr>${commentRow}
    </table>
    <p style="margin:0 0 12px;">
      <a href="${escapeHtml(versionUrl)}" style="display:inline-block;padding:10px 18px;background-color:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:500;">Visa versionen</a>
    </p>
    <p style="margin:0;">
      <a href="${escapeHtml(mapUrl)}" style="color:#2563eb;text-decoration:none;">Visa kartan</a>
    </p>
  `.trim();

  const html = buildHtmlEmail({
    title: subject,
    bodyHtml,
  });

  await sendMail({ to: adminEmail, subject, text, html });
}

type CheckoutMailContext = {
  checkoutId: string;
  map: { title: string; slug: string };
  owner: { name: string | null | undefined; email: string };
};

function checkoutDetailUrl(slug: string, checkoutId: string): string {
  return `${getAppBaseUrl()}/maps/${slug}/checkout/${checkoutId}`;
}

function ownerLabel(owner: CheckoutMailContext["owner"]): string {
  return owner.name?.trim() || owner.email;
}

async function resolveCheckoutRecipients(ownerEmail: string): Promise<string[]> {
  const adminEmail = await getAdminNotificationEmail();
  const envAdmin = process.env.CHECKOUT_ADMIN_NOTIFY_EMAIL?.trim();
  const recipients = new Set<string>([ownerEmail]);
  if (adminEmail) recipients.add(adminEmail);
  if (envAdmin) recipients.add(envAdmin);
  return [...recipients];
}

function fireAndForget(promise: Promise<void>, label: string): void {
  void promise.catch((err) => {
    console.error(`[email] Failed to send ${label}:`, err);
  });
}

export function notifyCheckoutCreated(ctx: CheckoutMailContext): void {
  fireAndForget(notifyCheckoutCreatedAsync(ctx), "checkout created");
}

async function notifyCheckoutCreatedAsync(ctx: CheckoutMailContext): Promise<void> {
  if (!(await isEmailConfigured())) return;

  const url = checkoutDetailUrl(ctx.map.slug, ctx.checkoutId);
  const subject = `Ny checkout — ${ctx.map.title}`;
  const text = [
    `${ownerLabel(ctx.owner)} har checkat ut ett område på ${ctx.map.title}.`,
    "",
    `Visa checkout: ${url}`,
  ].join("\n");

  const bodyHtml = `
    <p style="margin:0 0 16px;"><strong>${escapeHtml(ownerLabel(ctx.owner))}</strong> har checkat ut ett område på <strong>${escapeHtml(ctx.map.title)}</strong>.</p>
    <p style="margin:0;"><a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 18px;background-color:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:500;">Visa checkout</a></p>
  `.trim();

  const html = buildHtmlEmail({ title: subject, bodyHtml });
  const recipients = await resolveCheckoutRecipients(ctx.owner.email);
  await Promise.all(recipients.map((to) => sendMail({ to, subject, text, html })));
}

export function notifyCheckinSubmitted(ctx: CheckoutMailContext): void {
  fireAndForget(notifyCheckinSubmittedAsync(ctx), "checkin submitted");
}

async function notifyCheckinSubmittedAsync(ctx: CheckoutMailContext): Promise<void> {
  if (!(await isEmailConfigured())) return;

  const url = checkoutDetailUrl(ctx.map.slug, ctx.checkoutId);
  const subject = `Checkin inskickad — ${ctx.map.title}`;
  const text = [
    `${ownerLabel(ctx.owner)} har checkat in ett redigerat område på ${ctx.map.title}.`,
    "",
    `Granska diff: ${url}`,
  ].join("\n");

  const bodyHtml = `
    <p style="margin:0 0 16px;"><strong>${escapeHtml(ownerLabel(ctx.owner))}</strong> har checkat in ett redigerat område på <strong>${escapeHtml(ctx.map.title)}</strong>.</p>
    <p style="margin:0;"><a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 18px;background-color:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:500;">Granska diff</a></p>
  `.trim();

  const html = buildHtmlEmail({ title: subject, bodyHtml });
  const recipients = await resolveCheckoutRecipients(ctx.owner.email);
  await Promise.all(recipients.map((to) => sendMail({ to, subject, text, html })));
}

export function notifyCheckoutUserConfirmed(ctx: CheckoutMailContext): void {
  fireAndForget(notifyCheckoutUserConfirmedAsync(ctx), "checkout user confirmed");
}

async function notifyCheckoutUserConfirmedAsync(ctx: CheckoutMailContext): Promise<void> {
  if (!(await isEmailConfigured())) return;

  const url = checkoutDetailUrl(ctx.map.slug, ctx.checkoutId);
  const subject = `Checkout bekräftad av användare — ${ctx.map.title}`;
  const text = [
    `${ownerLabel(ctx.owner)} har bekräftat integration av checkout på ${ctx.map.title}.`,
    "Admin-bekräftelse krävs innan ändringar slås ihop.",
    "",
    `Granska: ${url}`,
  ].join("\n");

  const bodyHtml = `
    <p style="margin:0 0 16px;"><strong>${escapeHtml(ownerLabel(ctx.owner))}</strong> har bekräftat integration.</p>
    <p style="margin:0 0 16px;">Admin-bekräftelse krävs innan ändringar slås ihop med aktuella versionen.</p>
    <p style="margin:0;"><a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 18px;background-color:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:500;">Granska checkout</a></p>
  `.trim();

  const html = buildHtmlEmail({ title: subject, bodyHtml });
  const adminEmail = await getAdminNotificationEmail();
  if (!adminEmail) return;
  await sendMail({ to: adminEmail, subject, text, html });
}

export function notifyCheckoutIntegrated(
  ctx: CheckoutMailContext & { versionNumber: number },
): void {
  fireAndForget(notifyCheckoutIntegratedAsync(ctx), "checkout integrated");
}

async function notifyCheckoutIntegratedAsync(
  ctx: CheckoutMailContext & { versionNumber: number },
): Promise<void> {
  if (!(await isEmailConfigured())) return;

  const mapUrl = `${getAppBaseUrl()}/maps/${ctx.map.slug}`;
  const subject = `Checkout integrerad — ${ctx.map.title}`;
  const text = [
    `Checkout på ${ctx.map.title} har integrerats som version ${ctx.versionNumber}.`,
    "",
    `Visa karta: ${mapUrl}`,
  ].join("\n");

  const bodyHtml = `
    <p style="margin:0 0 16px;">Checkout på <strong>${escapeHtml(ctx.map.title)}</strong> har integrerats som <strong>v${ctx.versionNumber}</strong>.</p>
    <p style="margin:0;"><a href="${escapeHtml(mapUrl)}" style="display:inline-block;padding:10px 18px;background-color:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:500;">Visa karta</a></p>
  `.trim();

  const html = buildHtmlEmail({ title: subject, bodyHtml });
  const recipients = await resolveCheckoutRecipients(ctx.owner.email);
  await Promise.all(recipients.map((to) => sendMail({ to, subject, text, html })));
}

export function notifyCheckoutCancelled(
  ctx: CheckoutMailContext & { reason?: string | null },
): void {
  fireAndForget(notifyCheckoutCancelledAsync(ctx), "checkout cancelled");
}

async function notifyCheckoutCancelledAsync(
  ctx: CheckoutMailContext & { reason?: string | null },
): Promise<void> {
  if (!(await isEmailConfigured())) return;

  const url = checkoutDetailUrl(ctx.map.slug, ctx.checkoutId);
  const subject = `Checkout avbruten — ${ctx.map.title}`;
  const reasonLine = ctx.reason ? `\nAnledning: ${ctx.reason}` : "";
  const text = [
    `Checkout på ${ctx.map.title} har avbrutits av administratör.${reasonLine}`,
    "",
    `Detaljer: ${url}`,
  ].join("\n");

  const reasonHtml = ctx.reason
    ? `<p style="margin:0 0 16px;">Anledning: ${escapeHtml(ctx.reason)}</p>`
    : "";

  const bodyHtml = `
    <p style="margin:0 0 16px;">Checkout på <strong>${escapeHtml(ctx.map.title)}</strong> har avbrutits av administratör.</p>
    ${reasonHtml}
    <p style="margin:0;"><a href="${escapeHtml(url)}" style="color:#2563eb;text-decoration:none;">Visa checkout</a></p>
  `.trim();

  const html = buildHtmlEmail({ title: subject, bodyHtml });
  const recipients = await resolveCheckoutRecipients(ctx.owner.email);
  await Promise.all(recipients.map((to) => sendMail({ to, subject, text, html })));
}

export function notifyCheckoutReminder(ctx: CheckoutMailContext & { days: number }): void {
  fireAndForget(notifyCheckoutReminderAsync(ctx), "checkout reminder");
}

async function notifyCheckoutReminderAsync(
  ctx: CheckoutMailContext & { days: number },
): Promise<void> {
  if (!(await isEmailConfigured())) return;

  const url = checkoutDetailUrl(ctx.map.slug, ctx.checkoutId);
  const subject = `Påminnelse: aktiv checkout — ${ctx.map.title}`;
  const text = [
    `Du har en aktiv checkout på ${ctx.map.title} som är äldre än ${ctx.days} dagar.`,
    "",
    `Checka in eller avbryt: ${url}`,
  ].join("\n");

  const bodyHtml = `
    <p style="margin:0 0 16px;">Du har en aktiv checkout på <strong>${escapeHtml(ctx.map.title)}</strong> som är äldre än ${ctx.days} dagar.</p>
    <p style="margin:0;"><a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 18px;background-color:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:500;">Öppna checkout</a></p>
  `.trim();

  const html = buildHtmlEmail({ title: subject, bodyHtml });
  await sendMail({ to: ctx.owner.email, subject, text, html });
}
