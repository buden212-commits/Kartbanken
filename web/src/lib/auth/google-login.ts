import { Prisma } from "@prisma/client";
import { logAction } from "@/lib/audit";
import { isApproved } from "@/lib/auth/permissions";
import { findClubMember } from "@/lib/eventor/members";
import { prisma } from "@/lib/prisma";
import { Role, type Role as RoleType } from "@/lib/roles";
import { rateLimit } from "@/lib/security/rate-limit";

export type GoogleLoginErrorCode =
  | "NotClubMember"
  | "AmbiguousName"
  | "EventorUnavailable"
  | "Rejected"
  | "UnverifiedEmail"
  | "RateLimited";

export type GoogleLoginResult =
  | { ok: true }
  | { ok: false; errorCode: GoogleLoginErrorCode };

type GoogleIdentity = {
  email: string;
  emailVerified: boolean;
  name: string | null;
  givenName: string | null;
  familyName: string | null;
  googleSub: string;
};

const authUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
} as const;

async function linkGoogleAccount(userId: string, googleSub: string): Promise<void> {
  const existing = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: { provider: "google", providerAccountId: googleSub },
    },
    select: { userId: true },
  });
  if (existing) return;

  try {
    await prisma.account.create({
      data: {
        userId,
        type: "oidc",
        provider: "google",
        providerAccountId: googleSub,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return;
    throw err;
  }
}

async function recordLogin(
  userId: string,
  email: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const loggedInAt = new Date();
  await prisma.user.update({
    where: { id: userId },
    data: { lastLoginAt: loggedInAt },
  });
  await logAction(userId, "LOGIN", "User", userId, {
    email,
    at: loggedInAt.toISOString(),
    provider: "google",
    ...metadata,
  });
}

async function notifyReader(user: { name: string | null; email: string }, via: "email" | "name") {
  const { notifyAdminOfGoogleReader } = await import("@/lib/email");
  void notifyAdminOfGoogleReader({
    name: user.name?.trim() || user.email,
    email: user.email,
    via,
  }).catch((err) => {
    console.error("[email] Failed to send Google reader notification:", err);
  });
}

export async function resolveGoogleLogin(identity: GoogleIdentity): Promise<GoogleLoginResult> {
  const email = identity.email.trim().toLowerCase();
  const emailVerified = identity.emailVerified === true;
  if (!email || !email.includes("@") || !emailVerified || !identity.googleSub) {
    return { ok: false, errorCode: "UnverifiedEmail" };
  }

  const name = identity.name?.trim() || null;
  const existing = await prisma.user.findUnique({
    where: { email },
    select: authUserSelect,
  });

  if (existing?.role === Role.REJECTED) {
    await logAction(existing.id, "LOGIN_FAILED", "User", existing.id, {
      reason: "role_blocked",
      provider: "google",
    });
    return { ok: false, errorCode: "Rejected" };
  }

  if (existing && isApproved(existing.role as RoleType)) {
    await linkGoogleAccount(existing.id, identity.googleSub);
    await recordLogin(existing.id, email, { match: "existing" });
    return { ok: true };
  }

  const rl = rateLimit(`google-login:${email}`, { limit: 10, windowMs: 15 * 60 * 1000 });
  if (!rl.ok) {
    await logAction(existing?.id ?? null, "LOGIN_FAILED", "User", existing?.id ?? email, {
      reason: "rate_limited",
      provider: "google",
    });
    return { ok: false, errorCode: "RateLimited" };
  }

  const member = await findClubMember({
    email,
    givenName: identity.givenName,
    familyName: identity.familyName,
    fullName: name,
  });

  if (member.status === "not_configured" || member.status === "unavailable") {
    await logAction(existing?.id ?? null, "LOGIN_FAILED", "User", existing?.id ?? email, {
      reason: member.status,
      provider: "google",
    });
    return { ok: false, errorCode: "EventorUnavailable" };
  }

  if (member.status === "ambiguous_name") {
    await logAction(existing?.id ?? null, "LOGIN_FAILED", "User", existing?.id ?? email, {
      reason: "ambiguous_name",
      provider: "google",
    });
    return { ok: false, errorCode: "AmbiguousName" };
  }

  if (member.status === "not_member") {
    await logAction(existing?.id ?? null, "LOGIN_FAILED", "User", existing?.id ?? email, {
      reason: "not_club_member",
      provider: "google",
    });
    return { ok: false, errorCode: "NotClubMember" };
  }

  if (existing?.role === Role.PENDING) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        role: Role.READER,
        approvedAt: new Date(),
        emailVerified: new Date(),
        name: existing.name ?? name,
        mustChangePassword: false,
      },
    });
    await logAction(existing.id, "ROLE_CHANGE", "User", existing.id, {
      from: Role.PENDING,
      to: Role.READER,
      source: "google",
      match: member.via,
    });
    await linkGoogleAccount(existing.id, identity.googleSub);
    await recordLogin(existing.id, email, { match: member.via });
    await notifyReader({ name: existing.name ?? name, email }, member.via);
    return { ok: true };
  }

  const created = await prisma.user.create({
    data: {
      name,
      email,
      emailVerified: new Date(),
      role: Role.READER,
      approvedAt: new Date(),
      mustChangePassword: false,
    },
    select: authUserSelect,
  });

  await logAction(created.id, "USER_CREATED", "User", created.id, {
    email,
    role: Role.READER,
    source: "google",
    match: member.via,
  });
  await linkGoogleAccount(created.id, identity.googleSub);
  await recordLogin(created.id, email, { match: member.via });
  await notifyReader({ name, email }, member.via);
  return { ok: true };
}
