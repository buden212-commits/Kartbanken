import { auth } from "@/auth";
import { canAdmin, canDownload, canUpload, isApproved } from "@/lib/auth/permissions";
import type { Role as RoleType } from "@/lib/roles";
import { NextResponse } from "next/server";

export type AuthSession = {
  user: {
    id: string;
    email: string;
    name?: string | null;
    role: RoleType;
  };
};

export async function requireSession(): Promise<AuthSession | NextResponse> {
  const session = await auth();
  if (!session?.user?.id || !isApproved(session.user.role)) {
    return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  }
  return session as AuthSession;
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
