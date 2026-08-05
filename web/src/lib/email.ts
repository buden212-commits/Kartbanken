import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { getAppBaseUrl } from "@/lib/app-url";
import {
  resolveNotificationRecipients,
  resolveOcdAttachmentRecipients,
} from "@/lib/settings/notification-recipients";
import {
  resolveAdminNotificationEmail,
  resolveSmtpConfig,
  type SmtpConfig,
} from "@/lib/settings/app-settings";
import { runAfterResponse } from "@/lib/background";
import { logEmailSent, type EmailSentAuditMetadata } from "@/lib/audit";
import { roleDescription, roleLabel } from "@/lib/auth/permissions";
import { readStoredFile } from "@/lib/storage";
import { Role, type Role as RoleType } from "@/lib/roles";

const APP_NAME = "IFK Mora Kartor";

type MailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

type SendMailOptions = {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: MailAttachment[];
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

export function formatSmtpErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (/application-specific password required|InvalidSecondFactor|534-5\.7\.9/i.test(message)) {
    return [
      "Gmail kräver ett app-lösenord — vanligt kontolösenord fungerar inte.",
      "Skapa ett under Google-konto → Säkerhet → Verifiering i två steg → App-lösenord.",
      "Klistra in app-lösenordet (16 tecken) i fältet App-lösenord och spara.",
    ].join(" ");
  }

  if (/535|authentication failed|invalid credentials|username and password not accepted/i.test(message)) {
    return "SMTP-inloggning misslyckades. Kontrollera Gmail-adress och app-lösenord.";
  }

  return message;
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
    attachments: options.attachments,
    headers: {
      "Content-Language": "sv",
      "X-Mailer": APP_NAME,
    },
  });
}

async function sendMailToNotificationRecipients(
  options: Omit<SendMailOptions, "to">,
): Promise<void> {
  const recipients = await resolveNotificationRecipients();
  if (recipients.length === 0) {
    console.warn("[email] No notification recipients configured — skipping email");
    return;
  }

  await Promise.all(recipients.map((to) => sendMail({ ...options, to })));
}

const TEST_ATTACHMENT_FILENAME = "test-bifogning.ocd";

function buildTestAttachment(): MailAttachment {
  return {
    filename: TEST_ATTACHMENT_FILENAME,
    content: Buffer.from(
      "IFK Mora Kartor — testbilaga. Detta är inte en riktig OCAD-fil, utan verifierar att bifogningar fungerar.\n",
      "utf-8",
    ),
    contentType: "application/octet-stream",
  };
}

export async function sendTestEmail(
  to: string,
  options?: { withAttachment?: boolean; triggeredByUserId?: string | null },
): Promise<void> {
  const baseUrl = getAppBaseUrl();
  const withAttachment = options?.withAttachment === true;
  const subject = withAttachment
    ? `Testmail med bifogad fil — ${APP_NAME}`
    : `Testmail — ${APP_NAME}`;
  const textLines = [
    `Detta är ett testmail från ${APP_NAME}.`,
    "",
    withAttachment
      ? "En testfil (.ocd) är bifogad för att verifiera att bilagor fungerar."
      : "Om du läser detta fungerar SMTP-inställningarna.",
    "",
    `Webbplats: ${baseUrl}`,
  ];
  const text = textLines.join("\n");

  const bodyHtml = `
    <p style="margin:0 0 16px;">Detta är ett testmail från ${escapeHtml(APP_NAME)}.</p>
    <p style="margin:0 0 16px;">${
      withAttachment
        ? "En testfil (.ocd) är bifogad för att verifiera att bilagor fungerar."
        : "Om du läser detta fungerar SMTP-inställningarna."
    }</p>
    <p style="margin:0;">
      <a href="${escapeHtml(baseUrl)}" style="color:#2563eb;text-decoration:none;">${escapeHtml(baseUrl.replace(/^https?:\/\//, ""))}</a>
    </p>
  `.trim();

  const html = buildHtmlEmail({
    title: subject,
    bodyHtml,
  });

  await sendMail({
    to,
    subject,
    text,
    html,
    attachments: withAttachment ? [buildTestAttachment()] : undefined,
  });

  if (withAttachment) {
    await recordEmailAudit(
      {
        kind: "test",
        subject,
        withAttachment: true,
        attachmentFilename: TEST_ATTACHMENT_FILENAME,
        recipientsWithAttachment: [to],
        recipientsWithoutAttachment: [],
      },
      { userId: options?.triggeredByUserId ?? null },
    );
  }
}

export async function sendTemporaryPasswordEmail(options: {
  to: string;
  name: string | null | undefined;
  temporaryPassword: string;
  expiresAt: Date;
}): Promise<void> {
  const loginUrl = `${getAppBaseUrl()}/login`;
  const expiresText = options.expiresAt.toLocaleString("sv-SE", {
    timeZone: "Europe/Stockholm",
    dateStyle: "medium",
    timeStyle: "short",
  });
  const greeting = options.name?.trim() ? `Hej ${options.name.trim()}!` : "Hej!";
  const subject = `Tillfälligt lösenord — ${APP_NAME}`;

  const text = [
    greeting,
    "",
    "Du har begärt återställning av lösenord.",
    "",
    `Tillfälligt lösenord: ${options.temporaryPassword}`,
    `Giltigt till: ${expiresText}`,
    "",
    "Logga in och byt till ett eget lösenord innan tiden går ut.",
    "",
    `Logga in: ${loginUrl}`,
  ].join("\n");

  const bodyHtml = `
    <p style="margin:0 0 16px;">${escapeHtml(greeting)}</p>
    <p style="margin:0 0 16px;">Du har begärt återställning av lösenord. Använd lösenordet nedan för att logga in.</p>
    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 20px;width:100%;font-size:15px;">
      <tr>
        <td style="padding:4px 12px 4px 0;color:#64748b;vertical-align:top;width:140px;">Tillfälligt lösenord</td>
        <td style="padding:4px 0;color:#0f172a;font-family:monospace;font-size:16px;">${escapeHtml(options.temporaryPassword)}</td>
      </tr>
      <tr>
        <td style="padding:4px 12px 4px 0;color:#64748b;vertical-align:top;">Giltigt till</td>
        <td style="padding:4px 0;color:#0f172a;">${escapeHtml(expiresText)}</td>
      </tr>
    </table>
    <p style="margin:0 0 16px;">Du måste byta till ett eget lösenord direkt efter inloggning.</p>
    <p style="margin:0;">
      <a href="${escapeHtml(loginUrl)}" style="display:inline-block;padding:10px 18px;background-color:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:500;">Logga in</a>
    </p>
  `.trim();

  const html = buildHtmlEmail({ title: subject, bodyHtml });

  await sendMail({ to: options.to, subject, text, html });
}

export async function notifyUserApproved(user: {
  email: string;
  name: string | null | undefined;
  role: string;
}): Promise<void> {
  if (!(await isEmailConfigured())) {
    console.warn("[email] SMTP not configured — skipping account approved notification");
    return;
  }

  const role = user.role as RoleType;
  if (role !== Role.READER && role !== Role.EDITOR && role !== Role.ADMIN) {
    return;
  }

  const loginUrl = `${getAppBaseUrl()}/login`;
  const greeting = user.name?.trim() ? `Hej ${user.name.trim()}!` : "Hej!";
  const permissionLabel = roleLabel(role);
  const permissionText = roleDescription(role);
  const subject = `Ditt konto är godkänt — ${APP_NAME}`;

  const text = [
    greeting,
    "",
    `Ditt konto på ${APP_NAME} har godkänts och du kan nu logga in.`,
    "",
    `Behörighet: ${permissionLabel}`,
    permissionText,
    "",
    `Logga in: ${loginUrl}`,
  ].join("\n");

  const bodyHtml = `
    <p style="margin:0 0 16px;">${escapeHtml(greeting)}</p>
    <p style="margin:0 0 16px;">Ditt konto har godkänts och du kan nu logga in i ${escapeHtml(APP_NAME)}.</p>
    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 20px;width:100%;font-size:15px;">
      <tr>
        <td style="padding:4px 12px 4px 0;color:#64748b;vertical-align:top;width:100px;">Behörighet</td>
        <td style="padding:4px 0;color:#0f172a;font-weight:600;">${escapeHtml(permissionLabel)}</td>
      </tr>
      <tr>
        <td style="padding:4px 12px 4px 0;color:#64748b;vertical-align:top;">Du kan</td>
        <td style="padding:4px 0;color:#0f172a;">${escapeHtml(permissionText)}</td>
      </tr>
    </table>
    <p style="margin:0;">
      <a href="${escapeHtml(loginUrl)}" style="display:inline-block;padding:10px 18px;background-color:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:500;">Logga in</a>
    </p>
  `.trim();

  const html = buildHtmlEmail({ title: subject, bodyHtml });

  await sendMail({ to: user.email, subject, text, html });
}

export async function notifyNewMapSuggestion(input: {
  mapTitle: string;
  mapSlug: string;
  suggestionId: string;
  versionNumber: number;
  categoryLabel: string;
  comment: string;
  authorName: string | null;
  authorEmail: string;
}): Promise<void> {
  if (!(await isEmailConfigured())) {
    console.warn("[email] SMTP not configured — skipping map suggestion notification");
    return;
  }

  const url = `${getAppBaseUrl()}/maps/${input.mapSlug}/suggestions/${input.suggestionId}`;
  const author = input.authorName?.trim() || input.authorEmail;
  const subject = `Nytt kartförslag — ${input.mapTitle}`;
  const text = [
    `${author} har lämnat ett kartförslag på ${input.mapTitle} (v${input.versionNumber}).`,
    "",
    `Kategori: ${input.categoryLabel}`,
    input.comment,
    "",
    `Visa förslag: ${url}`,
  ].join("\n");

  const bodyHtml = `
    <p style="margin:0 0 16px;">${escapeHtml(author)} har lämnat ett kartförslag på <strong>${escapeHtml(input.mapTitle)}</strong> (v${input.versionNumber}).</p>
    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 20px;width:100%;font-size:15px;">
      <tr>
        <td style="padding:4px 12px 4px 0;color:#64748b;vertical-align:top;width:90px;">Kategori</td>
        <td style="padding:4px 0;color:#0f172a;">${escapeHtml(input.categoryLabel)}</td>
      </tr>
      <tr>
        <td style="padding:4px 12px 4px 0;color:#64748b;vertical-align:top;">Kommentar</td>
        <td style="padding:4px 0;color:#0f172a;">${escapeHtml(input.comment)}</td>
      </tr>
    </table>
    <p style="margin:0;">
      <a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 18px;background-color:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:500;">Visa kartförslag</a>
    </p>
  `.trim();

  const html = buildHtmlEmail({ title: subject, bodyHtml });
  await sendMailToNotificationRecipients({ subject, text, html });
}

export async function notifyMapSuggestionReviewed(input: {
  mapTitle: string;
  mapSlug: string;
  suggestionId: string;
  versionNumber: number;
  categoryLabel: string;
  comment: string;
  statusLabel: string;
  reviewComment: string | null;
  creatorEmail: string;
  creatorName: string | null;
  receiveNotifications: boolean;
}): Promise<void> {
  if (!(await isEmailConfigured())) {
    console.warn("[email] SMTP not configured — skipping map suggestion review notification");
    return;
  }

  if (!input.receiveNotifications) {
    return;
  }

  const url = `${getAppBaseUrl()}/maps/${input.mapSlug}/suggestions/${input.suggestionId}`;
  const subject = `Kartförslag granskat — ${input.mapTitle}`;
  const textLines = [
    `Ditt kartförslag på ${input.mapTitle} (v${input.versionNumber}) har granskats.`,
    "",
    `Status: ${input.statusLabel}`,
    `Kategori: ${input.categoryLabel}`,
    input.comment,
  ];
  if (input.reviewComment) {
    textLines.push("", `Kommentar från redaktör: ${input.reviewComment}`);
  }
  textLines.push("", `Visa förslag: ${url}`);
  const text = textLines.join("\n");

  const reviewRow = input.reviewComment
    ? `<tr>
        <td style="padding:4px 12px 4px 0;color:#64748b;vertical-align:top;">Kommentar</td>
        <td style="padding:4px 0;color:#0f172a;">${escapeHtml(input.reviewComment)}</td>
      </tr>`
    : "";

  const bodyHtml = `
    <p style="margin:0 0 16px;">Ditt kartförslag på <strong>${escapeHtml(input.mapTitle)}</strong> (v${input.versionNumber}) har granskats.</p>
    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 20px;width:100%;font-size:15px;">
      <tr>
        <td style="padding:4px 12px 4px 0;color:#64748b;vertical-align:top;width:90px;">Status</td>
        <td style="padding:4px 0;color:#0f172a;font-weight:600;">${escapeHtml(input.statusLabel)}</td>
      </tr>
      <tr>
        <td style="padding:4px 12px 4px 0;color:#64748b;vertical-align:top;">Kategori</td>
        <td style="padding:4px 0;color:#0f172a;">${escapeHtml(input.categoryLabel)}</td>
      </tr>
      ${reviewRow}
    </table>
    <p style="margin:0;">
      <a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 18px;background-color:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:500;">Visa kartförslag</a>
    </p>
  `.trim();

  const html = buildHtmlEmail({ title: subject, bodyHtml });
  await sendMail({ to: input.creatorEmail, subject, text, html });
}

export async function notifyAdminOfNewRegistration(user: {
  name: string;
  email: string;
}): Promise<void> {
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

  await sendMailToNotificationRecipients({ subject, text, html });
}

function ocdAttachmentFilename(originalFilename: string, fallbackBase: string): string {
  return originalFilename.toLowerCase().endsWith(".ocd")
    ? originalFilename
    : `${fallbackBase}.ocd`;
}

async function recordEmailAudit(
  metadata: EmailSentAuditMetadata,
  options?: {
    userId?: string | null;
    targetType?: string;
    targetId?: string;
  },
): Promise<void> {
  try {
    await logEmailSent(metadata, options);
  } catch (err) {
    console.error("[email] Failed to write email audit log:", err);
  }
}

type EmailAuditContext = {
  kind: EmailSentAuditMetadata["kind"];
  mapSlug?: string;
  mapTitle?: string;
  versionNumber?: number;
  targetType?: string;
  targetId?: string;
  userId?: string | null;
};

async function sendMailsWithOptionalOcdAttachment(options: {
  recipients: string[];
  subject: string;
  text: string;
  bodyHtml: string;
  storagePath?: string;
  attachmentFilename?: string;
  audit?: EmailAuditContext;
}): Promise<void> {
  const ocdRecipients = await resolveOcdAttachmentRecipients();

  let mapAttachment: MailAttachment | null = null;
  let attachmentError: string | undefined;
  if (ocdRecipients.size > 0 && options.storagePath && options.attachmentFilename) {
    try {
      const fileBuffer = await readStoredFile(options.storagePath);
      mapAttachment = {
        filename: ocdAttachmentFilename(options.attachmentFilename, options.attachmentFilename),
        content: fileBuffer,
        contentType: "application/octet-stream",
      };
    } catch (err) {
      attachmentError = err instanceof Error ? err.message : "Kunde inte läsa kartfil";
      console.error("[email] Could not read map file for email attachment:", err);
    }
  }

  const recipientsWithAttachment: string[] = [];
  const recipientsWithoutAttachment: string[] = [];

  await Promise.all(
    options.recipients.map(async (to) => {
      const includeAttachment = mapAttachment !== null && ocdRecipients.has(to.toLowerCase());
      if (includeAttachment) recipientsWithAttachment.push(to);
      else recipientsWithoutAttachment.push(to);

      const recipientText = includeAttachment
        ? `${options.text}\n\nKartfilen (.ocd) är bifogad till detta meddelande.`
        : options.text;

      const recipientBodyHtml = includeAttachment
        ? `${options.bodyHtml}<p style="margin:16px 0 0;">Kartfilen (.ocd) är bifogad till detta meddelande.</p>`
        : options.bodyHtml;

      await sendMail({
        to,
        subject: options.subject,
        text: recipientText,
        html: buildHtmlEmail({ title: options.subject, bodyHtml: recipientBodyHtml }),
        attachments: includeAttachment && mapAttachment ? [mapAttachment] : undefined,
      });
    }),
  );

  if (options.audit) {
    await recordEmailAudit(
      {
        kind: options.audit.kind,
        subject: options.subject,
        withAttachment: recipientsWithAttachment.length > 0,
        attachmentFilename: mapAttachment?.filename ?? options.attachmentFilename,
        attachmentError,
        recipientsWithAttachment,
        recipientsWithoutAttachment,
        mapSlug: options.audit.mapSlug,
        mapTitle: options.audit.mapTitle,
        versionNumber: options.audit.versionNumber,
      },
      {
        userId: options.audit.userId ?? null,
        targetType: options.audit.targetType,
        targetId: options.audit.targetId,
      },
    );
  }
}

export async function notifyAdminOfNewUpload(upload: {
  uploader: { name: string | null | undefined; email: string };
  map: { title: string; slug: string };
  version: {
    id: string;
    versionNumber: number;
    originalFilename: string;
    comment?: string | null;
    storagePath: string;
  };
}): Promise<void> {
  if (!(await isEmailConfigured())) {
    console.warn("[email] SMTP not configured — skipping upload notification");
    return;
  }

  const recipients = await resolveNotificationRecipients();
  if (recipients.length === 0) {
    console.warn("[email] No notification recipients configured — skipping upload notification");
    return;
  }

  const uploaderName = upload.uploader.name?.trim() || upload.uploader.email;
  const mapUrl = `${getAppBaseUrl()}/maps/${upload.map.slug}`;
  const versionUrl = `${mapUrl}/versions/${upload.version.id}`;
  const commentText = upload.version.comment?.trim() || "Ingen kommentar angiven";
  const subject = `Ny version av ${upload.map.title} — ${APP_NAME}`;

  const textLines = [
    `Hej!`,
    ``,
    `Det finns en ny version av kartan «${upload.map.title}» i ${APP_NAME}.`,
    ``,
    `Karta: ${upload.map.title}`,
    `Kommentar: ${commentText}`,
    `Version: v${upload.version.versionNumber}`,
    `Uppladdad av: ${uploaderName}`,
    ``,
    `Visa versionen: ${versionUrl}`,
    `Visa kartan: ${mapUrl}`,
  ];

  const text = textLines.join("\n");

  const bodyHtml = `
    <p style="margin:0 0 16px;">Hej!</p>
    <p style="margin:0 0 16px;">Det finns en ny version av kartan <strong>${escapeHtml(upload.map.title)}</strong> i ${escapeHtml(APP_NAME)}.</p>
    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 20px;width:100%;font-size:15px;">
      <tr>
        <td style="padding:4px 12px 4px 0;color:#64748b;vertical-align:top;width:110px;">Karta</td>
        <td style="padding:4px 0;color:#0f172a;">${escapeHtml(upload.map.title)}</td>
      </tr>
      <tr>
        <td style="padding:4px 12px 4px 0;color:#64748b;vertical-align:top;">Kommentar</td>
        <td style="padding:4px 0;color:#0f172a;">${escapeHtml(commentText)}</td>
      </tr>
      <tr>
        <td style="padding:4px 12px 4px 0;color:#64748b;vertical-align:top;">Version</td>
        <td style="padding:4px 0;color:#0f172a;">v${upload.version.versionNumber}</td>
      </tr>
      <tr>
        <td style="padding:4px 12px 4px 0;color:#64748b;vertical-align:top;">Uppladdad av</td>
        <td style="padding:4px 0;color:#0f172a;">${escapeHtml(uploaderName)}</td>
      </tr>
    </table>
    <p style="margin:0 0 12px;">
      <a href="${escapeHtml(versionUrl)}" style="display:inline-block;padding:10px 18px;background-color:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:500;">Visa versionen på webben</a>
    </p>
    <p style="margin:0;">Med vänliga hälsningar,<br>${escapeHtml(APP_NAME)}</p>
  `.trim();

  await sendMailsWithOptionalOcdAttachment({
    recipients,
    subject,
    text,
    bodyHtml,
    storagePath: upload.version.storagePath,
    attachmentFilename: ocdAttachmentFilename(
      upload.version.originalFilename,
      `${upload.map.title.replace(/\s+/g, "-")}-v${upload.version.versionNumber}`,
    ),
    audit: {
      kind: "new_upload",
      mapSlug: upload.map.slug,
      mapTitle: upload.map.title,
      versionNumber: upload.version.versionNumber,
      targetType: "MapVersion",
      targetId: upload.version.id,
    },
  });
}

type CheckoutMailContext = {
  checkoutId: string;
  map: { title: string; slug: string };
  owner: { name: string | null | undefined; email: string };
  checkin?: {
    storagePath: string;
    filename: string;
  };
};

function checkoutDetailUrl(slug: string, checkoutId: string): string {
  return `${getAppBaseUrl()}/maps/${slug}/checkout/${checkoutId}`;
}

function ownerLabel(owner: CheckoutMailContext["owner"]): string {
  return owner.name?.trim() || owner.email;
}

async function resolveCheckoutRecipients(ownerEmail: string): Promise<string[]> {
  const envAdmin = process.env.CHECKOUT_ADMIN_NOTIFY_EMAIL?.trim();
  const recipients = new Set<string>([
    ownerEmail.trim().toLowerCase(),
    ...(await resolveNotificationRecipients()),
  ]);
  if (envAdmin) recipients.add(envAdmin.toLowerCase());
  return [...recipients];
}

function scheduleEmail(task: () => Promise<void>, label: string): void {
  runAfterResponse(async () => {
    try {
      await task();
    } catch (err) {
      console.error(`[email] Failed to send ${label}:`, err);
    }
  });
}

export function queueNotifyAdminOfNewUpload(
  upload: Parameters<typeof notifyAdminOfNewUpload>[0],
): void {
  scheduleEmail(() => notifyAdminOfNewUpload(upload), "new upload");
}

export function queueNotifyUserApproved(
  user: Parameters<typeof notifyUserApproved>[0],
): void {
  scheduleEmail(() => notifyUserApproved(user), "account approved");
}

export function queueNotifyNewMapSuggestion(
  input: Parameters<typeof notifyNewMapSuggestion>[0],
): void {
  scheduleEmail(() => notifyNewMapSuggestion(input), "map suggestion");
}

export function queueNotifyMapSuggestionReviewed(
  input: Parameters<typeof notifyMapSuggestionReviewed>[0],
): void {
  scheduleEmail(() => notifyMapSuggestionReviewed(input), "map suggestion reviewed");
}

export function notifyCheckoutCreated(ctx: CheckoutMailContext): void {
  scheduleEmail(() => notifyCheckoutCreatedAsync(ctx), "checkout created");
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
  scheduleEmail(() => notifyCheckinSubmittedAsync(ctx), "checkin submitted");
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

  const recipients = await resolveCheckoutRecipients(ctx.owner.email);
  await sendMailsWithOptionalOcdAttachment({
    recipients,
    subject,
    text,
    bodyHtml,
    storagePath: ctx.checkin?.storagePath,
    attachmentFilename: ctx.checkin
      ? ocdAttachmentFilename(
          ctx.checkin.filename,
          `${ctx.map.title.replace(/\s+/g, "-")}-checkin`,
        )
      : undefined,
    audit: {
      kind: "checkin",
      mapSlug: ctx.map.slug,
      mapTitle: ctx.map.title,
      targetType: "MapCheckout",
      targetId: ctx.checkoutId,
    },
  });
}

export function notifyCheckoutUserConfirmed(ctx: CheckoutMailContext): void {
  scheduleEmail(() => notifyCheckoutUserConfirmedAsync(ctx), "checkout user confirmed");
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
  await sendMailToNotificationRecipients({ subject, text, html });
}

export function notifyCheckoutIntegrated(
  ctx: CheckoutMailContext & { versionNumber: number },
): void {
  scheduleEmail(() => notifyCheckoutIntegratedAsync(ctx), "checkout integrated");
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
  scheduleEmail(() => notifyCheckoutCancelledAsync(ctx), "checkout cancelled");
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
  scheduleEmail(() => notifyCheckoutReminderAsync(ctx), "checkout reminder");
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
