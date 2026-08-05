import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { setUserNotificationPreferences } from "@/lib/settings/notification-recipients";

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Du måste vara inloggad" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ogiltig begäran" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Ogiltig begäran" }, { status: 400 });
  }

  const receiveNotifications =
    "receiveNotifications" in body && body.receiveNotifications === true;
  const receiveOcdAttachment =
    "receiveOcdAttachment" in body && body.receiveOcdAttachment === true;

  try {
    await setUserNotificationPreferences(session.user.id, {
      receiveNotifications,
      receiveOcdAttachment,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Kunde inte uppdatera notisinställningar",
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    receiveNotifications,
    receiveOcdAttachment: receiveNotifications && receiveOcdAttachment,
  });
}
