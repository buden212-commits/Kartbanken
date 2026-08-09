import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { logAction } from "@/lib/audit";
import { Role, type Role as RoleType } from "@/lib/roles";
import { verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";

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

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash) return null;

        if (user.mustChangePassword && user.passwordExpiresAt && new Date() > user.passwordExpiresAt) {
          return null;
        }

        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) return null;

        if (user.role === Role.PENDING || user.role === Role.REJECTED) {
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
          mustChangePassword: user.mustChangePassword,
        };
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.name = user.name;
        token.email = user.email;
        token.role = (user as { role?: RoleType }).role ?? Role.PENDING;
        token.mustChangePassword = (user as { mustChangePassword?: boolean }).mustChangePassword ?? false;
      }
      if (trigger === "update" && session?.user && "mustChangePassword" in session.user) {
        token.mustChangePassword = session.user.mustChangePassword === true;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.name = token.name ?? null;
        if (token.email) {
          session.user.email = token.email;
        }
        session.user.role = (token.role as RoleType) ?? Role.PENDING;
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
