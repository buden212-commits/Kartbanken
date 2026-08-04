import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_SALT = "ifk-mora-smtp-v1";

function getEncryptionKey(): Buffer | null {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) {
    return null;
  }

  return scryptSync(secret, KEY_SALT, 32);
}

export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  if (!key) {
    throw new Error("AUTH_SECRET saknas — kan inte kryptera SMTP-lösenord");
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export function decryptSecret(ciphertext: string): string {
  const key = getEncryptionKey();
  if (!key) {
    throw new Error("AUTH_SECRET saknas — kan inte dekryptera SMTP-lösenord");
  }

  const payload = Buffer.from(ciphertext, "base64");
  if (payload.length <= IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Ogiltigt krypterat SMTP-lösenord");
  }

  const iv = payload.subarray(0, IV_LENGTH);
  const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
