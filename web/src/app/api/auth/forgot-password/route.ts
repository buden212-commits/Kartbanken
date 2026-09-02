import { requestPasswordReset } from "@/lib/auth/password-reset";
import { clientIpFromRequest, rateLimit } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  let body: { email?: string };
  try {
    body = (await request.json()) as { email?: string };
  } catch {
    return NextResponse.json({ error: "Ogiltig begäran" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Ange e-postadress." }, { status: 400 });
  }

  const ip = clientIpFromRequest(request);
  const byIp = rateLimit(`forgot-ip:${ip}`, { limit: 10, windowMs: 60 * 60 * 1000 });
  const byEmail = rateLimit(`forgot-email:${email}`, { limit: 3, windowMs: 60 * 60 * 1000 });
  if (!byIp.ok || !byEmail.ok) {
    return NextResponse.json(
      { error: "För många försök. Försök igen senare." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.max(byIp.retryAfterSec, byEmail.retryAfterSec)),
        },
      },
    );
  }

  try {
    const result = await requestPasswordReset(email);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Password reset failed:", error);
    return NextResponse.json(
      { error: "Kunde inte skicka återställningsmail" },
      { status: 500 },
    );
  }
}
