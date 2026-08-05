import { randomBytes } from "crypto";

const TEMP_PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const TEMP_PASSWORD_LENGTH = 12;
export const TEMP_PASSWORD_VALID_MS = 60 * 60 * 1000;

export function generateTemporaryPassword(): string {
  const bytes = randomBytes(TEMP_PASSWORD_LENGTH);
  return Array.from(bytes, (byte) => TEMP_PASSWORD_CHARS[byte % TEMP_PASSWORD_CHARS.length]).join("");
}

export function temporaryPasswordExpiryDate(from = new Date()): Date {
  return new Date(from.getTime() + TEMP_PASSWORD_VALID_MS);
}

export function validateNewPassword(
  password: string,
  confirmPassword: string,
): { ok: true } | { ok: false; error: string } {
  if (password.length < 8) {
    return { ok: false, error: "Lösenordet måste vara minst 8 tecken." };
  }
  if (password !== confirmPassword) {
    return { ok: false, error: "Lösenorden matchar inte." };
  }
  return { ok: true };
}

export const FORGOT_PASSWORD_SUCCESS_MESSAGE =
  "Om e-postadressen finns registrerad skickas ett mail med ett tillfälligt lösenord inom några minuter.";
