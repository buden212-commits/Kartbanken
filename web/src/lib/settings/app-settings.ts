import { decryptSecret, encryptSecret } from "@/lib/settings/encryption";
import { prisma } from "@/lib/prisma";

export const APP_SETTINGS_ID = "default";
export const SMTP_PASS_PLACEHOLDER = "••••••••";

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
  enabled: boolean;
  hasPassword: boolean;
};

export type SmtpSettingsInput = {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass?: string;
  adminNotificationEmail: string;
  enabled: boolean;
};

function defaultPublicSettings(): SmtpSettingsPublic {
  return {
    smtpHost: process.env.SMTP_HOST?.trim() || "smtp.gmail.com",
    smtpPort: Number(process.env.SMTP_PORT ?? 587),
    smtpUser: process.env.SMTP_USER?.trim() || "",
    adminNotificationEmail:
      process.env.ADMIN_NOTIFICATION_EMAIL?.trim() ||
      process.env.INITIAL_ADMIN_EMAIL?.trim() ||
      "",
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

export async function resolveAdminNotificationEmail(): Promise<string | null> {
  const row = await getAppSettingsRow();

  if (row?.enabled) {
    const fromDb = row.adminNotificationEmail?.trim();
    if (fromDb) {
      return fromDb;
    }
  }

  const explicit = process.env.ADMIN_NOTIFICATION_EMAIL?.trim();
  if (explicit) {
    return explicit;
  }

  const fallback = process.env.INITIAL_ADMIN_EMAIL?.trim();
  return fallback || null;
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

  const row = await prisma.appSettings.upsert({
    where: { id: APP_SETTINGS_ID },
    create: {
      id: APP_SETTINGS_ID,
      smtpHost: input.smtpHost.trim() || "smtp.gmail.com",
      smtpPort: input.smtpPort,
      smtpUser: input.smtpUser.trim() || null,
      smtpPassEncrypted,
      adminNotificationEmail: input.adminNotificationEmail.trim() || null,
      enabled: input.enabled,
    },
    update: {
      smtpHost: input.smtpHost.trim() || "smtp.gmail.com",
      smtpPort: input.smtpPort,
      smtpUser: input.smtpUser.trim() || null,
      smtpPassEncrypted,
      adminNotificationEmail: input.adminNotificationEmail.trim() || null,
      enabled: input.enabled,
    },
  });

  return {
    smtpHost: row.smtpHost?.trim() || "smtp.gmail.com",
    smtpPort: row.smtpPort ?? 587,
    smtpUser: row.smtpUser?.trim() || "",
    adminNotificationEmail: row.adminNotificationEmail?.trim() || "",
    enabled: row.enabled,
    hasPassword: !!row.smtpPassEncrypted,
  };
}
