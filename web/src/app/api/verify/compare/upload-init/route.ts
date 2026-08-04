import { requireSession } from "@/lib/auth/api";
import { initTempCompareJob } from "@/lib/ocad/temp-compare";
import { supportsClientUploads, validateOcdUpload } from "@/lib/storage";
import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  if (!supportsClientUploads()) {
    return NextResponse.json(
      { error: "Client upload kräver Vercel Blob." },
      { status: 400 },
    );
  }

  const body = await request.json();
  const fileNameA = body.fileNameA as string | undefined;
  const sizeA = body.sizeA as number | undefined;
  const fileNameB = body.fileNameB as string | undefined;
  const sizeB = body.sizeB as number | undefined;

  if (!fileNameA || !sizeA || !fileNameB || !sizeB) {
    return NextResponse.json(
      { error: "Ange fileNameA, sizeA, fileNameB och sizeB" },
      { status: 400 },
    );
  }

  const validA = validateOcdUpload(fileNameA, sizeA);
  if (!validA.ok) {
    return NextResponse.json({ error: `Fil A: ${validA.error}` }, { status: 400 });
  }
  const validB = validateOcdUpload(fileNameB, sizeB);
  if (!validB.ok) {
    return NextResponse.json({ error: `Fil B: ${validB.error}` }, { status: 400 });
  }

  const { jobId, pathA, pathB } = await initTempCompareJob(
    session.user.id,
    fileNameA,
    fileNameB,
  );

  return NextResponse.json({ jobId, pathA, pathB });
}
