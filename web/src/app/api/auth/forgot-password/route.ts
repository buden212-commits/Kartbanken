import { requestPasswordReset } from "@/lib/auth/password-reset";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  let body: { email?: string };
  try {
    body = (await request.json()) as { email?: string };
  } catch {
    return NextResponse.json({ error: "Ogiltig begäran" }, { status: 400 });
  }

  const email = body.email?.trim();
  if (!email) {
    return NextResponse.json({ error: "Ange e-postadress." }, { status: 400 });
  }

  try {
    const result = await requestPasswordReset(email);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kunde inte skicka återställningsmail";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
