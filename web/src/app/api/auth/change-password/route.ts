import { auth } from "@/auth";
import { changeUserPassword } from "@/lib/auth/change-password";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Du måste vara inloggad." }, { status: 401 });
  }

  let body: {
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Ogiltig begäran" }, { status: 400 });
  }

  const newPassword = body.newPassword ?? "";
  const confirmPassword = body.confirmPassword ?? "";
  const mustChangePassword = session.user.mustChangePassword === true;

  const result = await changeUserPassword({
    userId: session.user.id,
    currentPassword: body.currentPassword,
    newPassword,
    confirmPassword,
    requireCurrentPassword: !mustChangePassword,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
