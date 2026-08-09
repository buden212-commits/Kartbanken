import { logAction } from "@/lib/audit";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { validateNewPassword } from "@/lib/auth/password-policy";
import { prisma } from "@/lib/prisma";

type ChangePasswordInput = {
  userId: string;
  currentPassword?: string;
  newPassword: string;
  confirmPassword: string;
  requireCurrentPassword: boolean;
};

export async function changeUserPassword(
  input: ChangePasswordInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const validation = validateNewPassword(input.newPassword, input.confirmPassword);
  if (!validation.ok) {
    return validation;
  }

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      mustChangePassword: true,
    },
  });

  if (!user?.passwordHash) {
    return { ok: false, error: "Användaren hittades inte." };
  }

  if (input.requireCurrentPassword) {
    if (!input.currentPassword) {
      return { ok: false, error: "Ange nuvarande lösenord." };
    }
    const currentValid = await verifyPassword(input.currentPassword, user.passwordHash);
    if (!currentValid) {
      return { ok: false, error: "Nuvarande lösenord är felaktigt." };
    }
  }

  const sameAsCurrent = await verifyPassword(input.newPassword, user.passwordHash);
  if (sameAsCurrent) {
    return { ok: false, error: "Välj ett nytt lösenord som skiljer sig från det nuvarande." };
  }

  const passwordHash = await hashPassword(input.newPassword);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      mustChangePassword: false,
      passwordExpiresAt: null,
    },
  });

  await logAction(user.id, "PASSWORD_CHANGED", "User", user.id, {
    email: user.email,
    forced: !input.requireCurrentPassword,
  });

  return { ok: true };
}

export async function isTemporaryPasswordExpired(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordExpiresAt: true, mustChangePassword: true },
  });
  if (!user?.mustChangePassword || !user.passwordExpiresAt) {
    return false;
  }
  return new Date() > user.passwordExpiresAt;
}
