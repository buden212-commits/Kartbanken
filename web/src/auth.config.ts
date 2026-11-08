import type { NextAuthConfig } from "next-auth";
import { Role, type Role as RoleType } from "@/lib/roles";

/**
 * Edge-säker auth-konfiguration för middleware.
 * Databas, Eventor och e-post hör hemma i auth.ts, som bara körs i Node.
 */
export const authConfig = {
  providers: [],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  trustHost: true,
  callbacks: {
    session({ session, token }) {
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
} satisfies NextAuthConfig;
