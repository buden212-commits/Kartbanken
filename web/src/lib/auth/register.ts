"use server";

import { hashPassword } from "@/lib/auth/password";
import { notifyAdminOfNewRegistration } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";

export type RegisterResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "duplicate_email"
        | "password_mismatch"
        | "password_too_short"
        | "invalid_email"
        | "missing_name";
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

  await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role: Role.PENDING,
      approvedAt: null,
      approvedById: null,
    },
  });

  void notifyAdminOfNewRegistration({ name, email }).catch((err) => {
    console.error("[email] Failed to send new user notification:", err);
  });

  return { ok: true };
}
