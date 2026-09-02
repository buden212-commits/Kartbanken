import { auth } from "@/auth";
import { canAdmin, canDownload, canUpload, isApproved } from "@/lib/auth/permissions";
import type { Role as RoleType } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export type AuthSession = {
  user: {
    id: string;
    email: string;
    name?: string | null;
    role: RoleType;
    mustChangePassword?: boolean;
  };
};

async function sessionFromDb(): Promise<AuthSession | NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      mustChangePassword: true,
    },
  });

  if (!dbUser || !isApproved(dbUser.role as RoleType)) {
    return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  }

  return {
    user: {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role as RoleType,
      mustChangePassword: dbUser.mustChangePassword,
    },
  };
}

export async function requireSession(): Promise<AuthSession | NextResponse> {
  return sessionFromDb();
}

export async function requireAdmin(): Promise<AuthSession | NextResponse> {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (!canAdmin(session.user.role)) {
    return NextResponse.json({ error: "Kräver administratör" }, { status: 403 });
  }
  return session;
}

export async function requireDownload(): Promise<AuthSession | NextResponse> {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (!canDownload(session.user.role)) {
    return NextResponse.json({ error: "Ingen nedladdningsrättighet" }, { status: 403 });
  }
  return session;
}

export async function requireUpload(): Promise<AuthSession | NextResponse> {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (!canUpload(session.user.role)) {
    return NextResponse.json({ error: "Ingen uppladdningsrättighet" }, { status: 403 });
  }
  return session;
}
