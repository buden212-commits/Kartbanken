import { decryptSecret, encryptSecret } from "@/lib/settings/encryption";
import { prisma } from "@/lib/prisma";

export const APP_SETTINGS_ID = "default";
export const SMTP_PASS_PLACEHOLDER = "••••••••";

const EMAIL_SEP = /[,;\n]+/;

export type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
};

export type SmtpSettingsPublic = {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  adminNotificationEmail: string;
  checkoutReminderDays: number;
  checkoutReminderRepeatDays: number;
  enabled: boolean;
  hasPassword: boolean;
};

export type SmtpSettingsInput = {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass?: string;
  adminNotificationEmail: string;
  checkoutReminderDays: number;
  checkoutReminderRepeatDays: number;
  enabled: boolean;
};

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw ?? fallback);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function defaultReminderDays(): number {
  return parsePositiveInt(process.env.CHECKOUT_REMINDER_DAYS, 7);
}

function defaultReminderRepeatDays(): number {
  return parsePositiveInt(process.env.CHECKOUT_REMINDER_REPEAT_DAYS, 7);
}

export function parseAdminNotificationEmails(raw: string | null | undefined): string[] {
  if (!raw?.trim()) {
    return [];
  }

  const seen = new Set<string>();
  const result: string[] = [];

  for (const part of raw.split(EMAIL_SEP)) {
    const email = part.trim();
    if (!email) continue;
    const normalized = email.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(email);
  }

  return result;
}

export function serializeAdminNotificationEmails(emails: string[]): string {
  return emails.map((email) => email.trim()).filter(Boolean).join(", ");
}

export function isValidNotificationEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function validateAdminNotificationEmails(raw: string): string[] {
  const emails = parseAdminNotificationEmails(raw);
  for (const email of emails) {
    if (!isValidNotificationEmail(email)) {
      throw new Error(`Ogiltig e-postadress: ${email}`);
    }
  }
  return emails;
}

export function clampReminderDays(value: number): number {
  if (!Number.isFinite(value)) {
    return 7;
  }
  return Math.min(365, Math.max(1, Math.floor(value)));
}

function defaultPublicSettings(): SmtpSettingsPublic {
  return {
    smtpHost: process.env.SMTP_HOST?.trim() || "smtp.gmail.com",
    smtpPort: Number(process.env.SMTP_PORT ?? 587),
    smtpUser: process.env.SMTP_USER?.trim() || "",
    adminNotificationEmail:
      serializeAdminNotificationEmails(
        parseAdminNotificationEmails(
          process.env.ADMIN_NOTIFICATION_EMAIL ??
            process.env.INITIAL_ADMIN_EMAIL ??
            "",
        ),
      ),
    checkoutReminderDays: defaultReminderDays(),
    checkoutReminderRepeatDays: defaultReminderRepeatDays(),
    enabled: false,
    hasPassword: !!process.env.SMTP_PASS?.trim(),
  };
}

export async function getAppSettingsRow() {
  return prisma.appSettings.findUnique({ where: { id: APP_SETTINGS_ID } });
}

export async function getSmtpSettingsPublic(): Promise<SmtpSettingsPublic> {
  const row = await getAppSettingsRow();
  if (!row) {
    return defaultPublicSettings();
  }

  return {
    smtpHost: row.smtpHost?.trim() || "smtp.gmail.com",
    smtpPort: row.smtpPort ?? 587,
    smtpUser: row.smtpUser?.trim() || "",
    adminNotificationEmail: row.adminNotificationEmail?.trim() || "",
    checkoutReminderDays: row.checkoutReminderDays ?? defaultReminderDays(),
    checkoutReminderRepeatDays:
      row.checkoutReminderRepeatDays ?? defaultReminderRepeatDays(),
    enabled: row.enabled,
    hasPassword: !!row.smtpPassEncrypted,
  };
}

function getEnvSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim() || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();

  if (!user || !pass) {
    return null;
  }

  return { host, port, user, pass };
}

export async function resolveSmtpConfig(): Promise<SmtpConfig | null> {
  const row = await getAppSettingsRow();

  if (row?.enabled && row.smtpUser?.trim() && row.smtpPassEncrypted) {
    try {
      return {
        host: row.smtpHost?.trim() || "smtp.gmail.com",
        port: row.smtpPort ?? 587,
        user: row.smtpUser.trim(),
        pass: decryptSecret(row.smtpPassEncrypted),
      };
    } catch (error) {
      console.warn("[settings] Kunde inte dekryptera SMTP-lösenord, använder .env som reserv:", error);
    }
  }

  return getEnvSmtpConfig();
}

export async function resolveAdminNotificationEmails(): Promise<string[]> {
  const row = await getAppSettingsRow();

  if (row?.enabled) {
    const fromDb = parseAdminNotificationEmails(row.adminNotificationEmail);
    if (fromDb.length > 0) {
      return fromDb;
    }
  }

  const explicit = parseAdminNotificationEmails(process.env.ADMIN_NOTIFICATION_EMAIL);
  if (explicit.length > 0) {
    return explicit;
  }

  const fallback = process.env.INITIAL_ADMIN_EMAIL?.trim();
  return fallback ? [fallback] : [];
}

export async function resolveAdminNotificationEmail(): Promise<string | null> {
  const emails = await resolveAdminNotificationEmails();
  return emails[0] ?? null;
}

export async function resolveCheckoutReminderDays(): Promise<number> {
  const row = await getAppSettingsRow();
  if (row?.checkoutReminderDays != null && row.checkoutReminderDays > 0) {
    return row.checkoutReminderDays;
  }
  return defaultReminderDays();
}

export async function resolveCheckoutReminderRepeatDays(): Promise<number> {
  const row = await getAppSettingsRow();
  if (row?.checkoutReminderRepeatDays != null && row.checkoutReminderRepeatDays > 0) {
    return row.checkoutReminderRepeatDays;
  }
  return defaultReminderRepeatDays();
}

export function shouldUpdateSmtpPassword(input: string | undefined | null): boolean {
  if (!input) {
    return false;
  }

  const trimmed = input.trim();
  if (!trimmed || trimmed === SMTP_PASS_PLACEHOLDER) {
    return false;
  }

  return true;
}

export async function upsertSmtpSettings(input: SmtpSettingsInput): Promise<SmtpSettingsPublic> {
  const existing = await getAppSettingsRow();
  let smtpPassEncrypted = existing?.smtpPassEncrypted ?? null;

  if (shouldUpdateSmtpPassword(input.smtpPass)) {
    smtpPassEncrypted = encryptSecret(input.smtpPass!.trim());
  }

  const adminEmails = validateAdminNotificationEmails(input.adminNotificationEmail);
  const checkoutReminderDays = clampReminderDays(input.checkoutReminderDays);
  const checkoutReminderRepeatDays = clampReminderDays(input.checkoutReminderRepeatDays);

  const row = await prisma.appSettings.upsert({
    where: { id: APP_SETTINGS_ID },
    create: {
      id: APP_SETTINGS_ID,
      smtpHost: input.smtpHost.trim() || "smtp.gmail.com",
      smtpPort: input.smtpPort,
      smtpUser: input.smtpUser.trim() || null,
      smtpPassEncrypted,
      adminNotificationEmail: serializeAdminNotificationEmails(adminEmails) || null,
      checkoutReminderDays,
      checkoutReminderRepeatDays,
      enabled: input.enabled,
    },
    update: {
      smtpHost: input.smtpHost.trim() || "smtp.gmail.com",
      smtpPort: input.smtpPort,
      smtpUser: input.smtpUser.trim() || null,
      smtpPassEncrypted,
      adminNotificationEmail: serializeAdminNotificationEmails(adminEmails) || null,
      checkoutReminderDays,
      checkoutReminderRepeatDays,
      enabled: input.enabled,
    },
  });

  return {
    smtpHost: row.smtpHost?.trim() || "smtp.gmail.com",
    smtpPort: row.smtpPort ?? 587,
    smtpUser: row.smtpUser?.trim() || "",
    adminNotificationEmail: row.adminNotificationEmail?.trim() || "",
    checkoutReminderDays: row.checkoutReminderDays ?? checkoutReminderDays,
    checkoutReminderRepeatDays: row.checkoutReminderRepeatDays ?? checkoutReminderRepeatDays,
    enabled: row.enabled,
    hasPassword: !!row.smtpPassEncrypted,
  };
}
