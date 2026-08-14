import { requireSession } from "@/lib/auth/api";
import { canCheckout } from "@/lib/auth/permissions";
import { commitImportPartialJob, readImportPartialJob } from "@/lib/checkout/import-partial";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const maxDuration = 300;

type RouteParams = { params: Promise<{ slug: string; jobId: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (!canCheckout(session.user.role)) {
    return NextResponse.json({ error: "Ingen behörighet" }, { status: 403 });
  }

  const { slug, jobId } = await params;
  const map = await prisma.mapFile.findUnique({ where: { slug }, select: { id: true } });
  if (!map) {
    return NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 });
  }

  const job = await readImportPartialJob(jobId);
  if (!job || job.userId !== session.user.id || job.mapFileId !== map.id) {
    return NextResponse.json({ error: "Importjobbet hittades inte" }, { status: 404 });
  }

  return NextResponse.json({
    jobId: job.id,
    headVersionId: job.headVersionId,
    fileName: job.fileName,
    analysis: job.analysis,
    error: job.error,
  });
}

export async function POST(request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (!canCheckout(session.user.role)) {
    return NextResponse.json({ error: "Endast redaktörer kan importera delkarta" }, { status: 403 });
  }

  const { slug, jobId } = await params;
  const map = await prisma.mapFile.findUnique({ where: { slug }, select: { id: true } });
  if (!map) {
    return NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 });
  }

  let body: { comment?: string } = {};
  try {
    body = (await request.json()) as { comment?: string };
  } catch {
    body = {};
  }

  try {
    const result = await commitImportPartialJob({
      jobId,
      userId: session.user.id,
      mapFileId: map.id,
      mapSlug: slug,
      comment: body.comment,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("Import partial commit failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kunde inte skapa utcheckning" },
      { status: 400 },
    );
  }
}
