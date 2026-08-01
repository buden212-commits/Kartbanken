import { requireSession } from "@/lib/auth/api";
import {
  createTempCompareJob,
  processTempCompareJob,
} from "@/lib/ocad/temp-compare";
import { validateOcdUpload } from "@/lib/storage";
import { NextResponse } from "next/server";

export const maxDuration = 300;

export async function POST(request: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const formData = await request.formData();
  const fileA = formData.get("fileA");
  const fileB = formData.get("fileB");

  if (!(fileA instanceof File) || fileA.size === 0) {
    return NextResponse.json({ error: "Välj äldre OCAD-fil (fil A)" }, { status: 400 });
  }
  if (!(fileB instanceof File) || fileB.size === 0) {
    return NextResponse.json({ error: "Välj nyare OCAD-fil (fil B)" }, { status: 400 });
  }

  const validA = validateOcdUpload(fileA.name, fileA.size);
  if (!validA.ok) {
    return NextResponse.json({ error: `Fil A: ${validA.error}` }, { status: 400 });
  }
  const validB = validateOcdUpload(fileB.name, fileB.size);
  if (!validB.ok) {
    return NextResponse.json({ error: `Fil B: ${validB.error}` }, { status: 400 });
  }

  const [bufferA, bufferB] = await Promise.all([
    Buffer.from(await fileA.arrayBuffer()),
    Buffer.from(await fileB.arrayBuffer()),
  ]);

  const jobId = await createTempCompareJob(
    session.user.id,
    bufferA,
    bufferB,
    fileA.name,
    fileB.name,
  );

  void processTempCompareJob(jobId).catch(console.error);

  return NextResponse.json({
    jobId,
    status: "processing",
    fileNameA: fileA.name,
    fileNameB: fileB.name,
  });
}
