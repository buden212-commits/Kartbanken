import { requireSession } from "@/lib/auth/api";
import { runAfterResponse } from "@/lib/background";
import {
  failStaleTempCompareJob,
  isTempCompareJobStale,
  processTempCompareJob,
  readTempCompareJob,
} from "@/lib/ocad/temp-compare";
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

  if (job.status === "processing") {
    if (isTempCompareJobStale(job)) {
      const failed = await failStaleTempCompareJob(job);
      return NextResponse.json({
        status: "error",
        error: failed.error ?? "Jämförelsen tog för lång tid",
      });
    }

    // Säkerställ att bakgrundsarbete körs även om initial after()-callback aldrig startade (Vercel).
    runAfterResponse(() => processTempCompareJob(jobId));

    return NextResponse.json({
      status: "processing",
      fileNameA: job.fileNameA,
      fileNameB: job.fileNameB,
    });
  }

  if (job.status === "error") {
    return NextResponse.json({
      status: "error",
      error: job.error ?? "Jämförelse misslyckades",
    });
  }

  return NextResponse.json({
    status: "ok",
    fileNameA: job.fileNameA,
    fileNameB: job.fileNameB,
    summary: job.summary,
    changes: job.changes ?? [],
    layerPaths: job.summary?.layerPaths ?? null,
  });
}
