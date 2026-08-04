"use server";

import { verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";

export type LoginBlockReason = "pending" | "rejected";

export async function getLoginBlockReason(
  email: string,
  password: string,
): Promise<LoginBlockReason | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !password) return null;

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user?.passwordHash) return null;

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return null;

  if (user.role === Role.PENDING) return "pending";
  if (user.role === Role.REJECTED) return "rejected";
  return null;
}
