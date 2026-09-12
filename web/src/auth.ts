import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { logAction } from "@/lib/audit";
import { Role, type Role as RoleType } from "@/lib/roles";
import { verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/security/rate-limit";

async function loadAuthUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      canFieldEdit: true,
      mustChangePassword: true,
      passwordExpiresAt: true,
    },
  });
}

function applyDbUserToToken(
  token: Record<string, unknown>,
  dbUser: NonNullable<Awaited<ReturnType<typeof loadAuthUser>>>,
) {
  const expiredTemp =
    dbUser.mustChangePassword &&
    dbUser.passwordExpiresAt != null &&
    new Date() > dbUser.passwordExpiresAt;

  token.id = dbUser.id;
  token.name = dbUser.name;
  token.email = dbUser.email;
  token.role = dbUser.role as RoleType;
  token.canFieldEdit = dbUser.canFieldEdit;
  token.mustChangePassword = dbUser.mustChangePassword || expiredTemp;
  delete token.error;
  return token;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "E-post", type: "email" },
        password: { label: "Lösenord", type: "password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email?.toString().trim().toLowerCase();
        const password = credentials?.password?.toString();

        if (!email || !password) return null;

        const rl = rateLimit(`login:${email}`, { limit: 10, windowMs: 15 * 60 * 1000 });
        if (!rl.ok) {
          await logAction(null, "LOGIN_FAILED", "User", email, { reason: "rate_limited" });
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash) {
          await logAction(null, "LOGIN_FAILED", "User", email, { reason: "unknown_user" });
          return null;
        }

        if (user.mustChangePassword && user.passwordExpiresAt && new Date() > user.passwordExpiresAt) {
          await logAction(user.id, "LOGIN_FAILED", "User", user.id, { reason: "temp_password_expired" });
          return null;
        }

        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) {
          await logAction(user.id, "LOGIN_FAILED", "User", user.id, { reason: "bad_password" });
          return null;
        }

        if (user.role === Role.PENDING || user.role === Role.REJECTED) {
          await logAction(user.id, "LOGIN_FAILED", "User", user.id, { reason: "role_blocked" });
          return null;
        }

        const loggedInAt = new Date();
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: loggedInAt },
        });
        await logAction(user.id, "LOGIN", "User", user.id, {
          email: user.email,
          at: loggedInAt.toISOString(),
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role as RoleType,
          canFieldEdit: user.canFieldEdit,
          mustChangePassword: user.mustChangePassword,
        };
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.name = user.name;
        token.email = user.email;
        token.role = (user as { role?: RoleType }).role ?? Role.PENDING;
        token.canFieldEdit = (user as { canFieldEdit?: boolean }).canFieldEdit ?? false;
        token.mustChangePassword =
          (user as { mustChangePassword?: boolean }).mustChangePassword ?? false;
        return token;
      }

      // Synka från DB vid session.update() (t.ex. efter lösenordsbyte) — aldrig från klientfält.
      // Körs på Node-routen /api/auth/session, inte i edge-middleware.
      if (trigger === "update" && typeof token.id === "string") {
        const dbUser = await loadAuthUser(token.id);
        if (!dbUser) {
          token.error = "UserNotFound";
          return token;
        }
        return applyDbUserToToken(token, dbUser);
      }

      return token;
    },
    async session({ session, token }) {
      if (token.error === "UserNotFound") {
        session.user.id = "";
        session.user.role = Role.PENDING;
        session.user.mustChangePassword = false;
        return session;
      }
      if (session.user) {
        session.user.id = token.id as string;
        session.user.name = (token.name as string | null | undefined) ?? null;
        if (token.email) {
          session.user.email = token.email as string;
        }
        session.user.role = (token.role as RoleType) ?? Role.PENDING;
        session.user.canFieldEdit = token.canFieldEdit === true;
        session.user.mustChangePassword = token.mustChangePassword === true;
      }
      return session;
    },
  },
  session: {
    strategy: "jwt",
  },
  trustHost: true,
});
