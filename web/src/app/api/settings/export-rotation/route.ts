import { requireSession } from "@/lib/auth/api";
import { resolveExportRotationDeg } from "@/lib/settings/app-settings";
import { NextResponse } from "next/server";

/** Public (authenticated) export settings used by map/course PDF clients. */
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) {
    return session;
  }

  const exportRotationDeg = await resolveExportRotationDeg();
  return NextResponse.json({ exportRotationDeg });
}
