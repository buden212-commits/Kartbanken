import { requireSession } from "@/lib/auth/api";
import { getTempComparePreviewPath, readTempCompareJob } from "@/lib/ocad/temp-compare";
import { readStoredFile } from "@/lib/storage";
import { NextResponse } from "next/server";

export const maxDuration = 300;

type RouteParams = { params: Promise<{ jobId: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const { jobId } = await params;
  const job = await readTempCompareJob(jobId);

  if (!job) {
    return NextResponse.json({ error: "Jämförelsen hittades inte" }, { status: 404 });
  }

  if (job.userId !== session.user.id) {
    return NextResponse.json({ error: "Åtkomst nekad" }, { status: 403 });
  }

  if (job.status !== "ok") {
    return NextResponse.json({ error: "Preview är inte klar ännu" }, { status: 404 });
  }

  try {
    const svg = await readStoredFile(getTempComparePreviewPath(jobId));
    return new NextResponse(new Uint8Array(svg), {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Preview saknas" }, { status: 404 });
  }
}
