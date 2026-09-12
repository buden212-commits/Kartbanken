import type { Role } from "@/lib/roles";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      canFieldEdit?: boolean;
      mustChangePassword?: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
    canFieldEdit?: boolean;
    mustChangePassword?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
    canFieldEdit?: boolean;
    mustChangePassword?: boolean;
  }
}
