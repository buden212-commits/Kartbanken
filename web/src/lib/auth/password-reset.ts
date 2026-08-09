import { logAction } from "@/lib/audit";
import { hashPassword } from "@/lib/auth/password";
import {
  FORGOT_PASSWORD_SUCCESS_MESSAGE,
  generateTemporaryPassword,
  temporaryPasswordExpiryDate,
} from "@/lib/auth/password-policy";
import { sendTemporaryPasswordEmail } from "@/lib/email";
import { isEmailConfigured } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";

export async function requestPasswordReset(email: string): Promise<{ message: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail.includes("@")) {
    return { message: FORGOT_PASSWORD_SUCCESS_MESSAGE };
  }

  if (!(await isEmailConfigured())) {
    throw new Error("E-post är inte konfigurerat. Kontakta administratören.");
  }

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, email: true, name: true, role: true },
  });

  if (!user || user.role === Role.PENDING || user.role === Role.REJECTED) {
    return { message: FORGOT_PASSWORD_SUCCESS_MESSAGE };
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const passwordExpiresAt = temporaryPasswordExpiryDate();

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      mustChangePassword: true,
      passwordExpiresAt,
    },
  });

  await sendTemporaryPasswordEmail({
    to: user.email,
    name: user.name,
    temporaryPassword,
    expiresAt: passwordExpiresAt,
  });

  await logAction(user.id, "PASSWORD_RESET_REQUESTED", "User", user.id, {
    email: user.email,
    expiresAt: passwordExpiresAt.toISOString(),
  });

  return { message: FORGOT_PASSWORD_SUCCESS_MESSAGE };
}
