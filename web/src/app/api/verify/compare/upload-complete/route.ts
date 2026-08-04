import { requireSession } from "@/lib/auth/api";
import { runAfterResponse } from "@/lib/background";
import {
  completeTempCompareJob,
  processTempCompareJob,
} from "@/lib/ocad/temp-compare";
import { supportsClientUploads } from "@/lib/storage";
import { NextResponse } from "next/server";

export const maxDuration = 300;

export async function POST(request: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  if (!supportsClientUploads()) {
    return NextResponse.json({ error: "Client upload är inte aktiverat" }, { status: 400 });
  }

  const body = await request.json();
  const jobId = body.jobId as string | undefined;

  if (!jobId) {
    return NextResponse.json({ error: "Ange jobId" }, { status: 400 });
  }

  try {
    const job = await completeTempCompareJob(jobId, session.user.id);
    runAfterResponse(() => processTempCompareJob(jobId));

    return NextResponse.json({
      jobId,
      status: "processing",
      fileNameA: job.fileNameA,
      fileNameB: job.fileNameB,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Kunde inte slutföra uppladdning";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
