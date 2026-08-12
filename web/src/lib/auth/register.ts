"use server";

import { logAction } from "@/lib/audit";
import { hashPassword } from "@/lib/auth/password";
import { notifyAdminOfNewRegistration } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";
import { rateLimit } from "@/lib/security/rate-limit";

export type RegisterResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "duplicate_email"
        | "password_mismatch"
        | "password_too_short"
        | "invalid_email"
        | "missing_name"
        | "rate_limited";
    };

export async function registerUser(formData: FormData): Promise<RegisterResult> {
  const name = formData.get("name")?.toString().trim() || null;
  const email = formData.get("email")?.toString().trim().toLowerCase();
  const password = formData.get("password")?.toString();
  const confirmPassword = formData.get("confirmPassword")?.toString();

  if (!name) {
    return { ok: false, error: "missing_name" };
  }

  if (!email || !email.includes("@")) {
    return { ok: false, error: "invalid_email" };
  }

  const rl = rateLimit(`register:${email}`, { limit: 5, windowMs: 60 * 60 * 1000 });
  if (!rl.ok) {
    return { ok: false, error: "rate_limited" };
  }

  if (!password || password.length < 8) {
    return { ok: false, error: "password_too_short" };
  }

  if (password !== confirmPassword) {
    return { ok: false, error: "password_mismatch" };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { ok: false, error: "duplicate_email" };
  }

  const passwordHash = await hashPassword(password);

  const created = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role: Role.PENDING,
      approvedAt: null,
      approvedById: null,
    },
  });

  await logAction(created.id, "USER_CREATED", "User", created.id, { email });

  void notifyAdminOfNewRegistration({ name, email }).catch((err) => {
    console.error("[email] Failed to send new user notification:", err);
  });

  return { ok: true };
}
