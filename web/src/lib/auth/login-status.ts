"use server";

import { verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";

export type LoginBlockReason = "pending" | "rejected" | "expired_temp_password";

export async function getLoginBlockReason(
  email: string,
  password: string,
): Promise<LoginBlockReason | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !password) return null;

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      passwordHash: true,
      role: true,
      mustChangePassword: true,
      passwordExpiresAt: true,
    },
  });
  if (!user?.passwordHash) return null;

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return null;

  if (
    user.mustChangePassword &&
    user.passwordExpiresAt &&
    new Date() > user.passwordExpiresAt
  ) {
    return "expired_temp_password";
  }

  if (user.role === Role.PENDING) return "pending";
  if (user.role === Role.REJECTED) return "rejected";
  return null;
}
