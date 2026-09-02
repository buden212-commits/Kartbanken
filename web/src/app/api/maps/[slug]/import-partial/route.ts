import { requireSession } from "@/lib/auth/api";
import { canCheckout } from "@/lib/auth/permissions";
import {
  analyzeExistingImportPartialJob,
  createAndAnalyzeImportPartial,
  initImportPartialJob,
} from "@/lib/checkout/import-partial";
import { getHeadVersionId } from "@/lib/checkout/repository";
import { prisma } from "@/lib/prisma";
import { shouldUseClientUpload, validateOcdUpload } from "@/lib/storage";
import { NextResponse } from "next/server";

export const maxDuration = 300;

type RouteParams = { params: Promise<{ slug: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (!canCheckout(session.user.role)) {
    return NextResponse.json({ error: "Endast redaktörer kan importera delkarta" }, { status: 403 });
  }

  const { slug } = await params;
  const map = await prisma.mapFile.findUnique({
    where: { slug },
    select: { id: true, archivedAt: true },
  });
  if (!map) {
    return NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 });
  }
  if (map.archivedAt) {
    return NextResponse.json({ error: "Arkiverat område kan inte importeras till" }, { status: 403 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    let body: { filename?: string; size?: number };
    try {
      body = (await request.json()) as { filename?: string; size?: number };
    } catch {
      return NextResponse.json({ error: "Ogiltig JSON" }, { status: 400 });
    }
    if (!body.filename || typeof body.size !== "number") {
      return NextResponse.json({ error: "filename och size krävs" }, { status: 400 });
    }
    const validation = validateOcdUpload(body.filename, body.size);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    if (!shouldUseClientUpload(body.size)) {
      return NextResponse.json(
        { error: "Använd direktuppladdning för små filer" },
        { status: 400 },
      );
    }
    const headVersionId = await getHeadVersionId(map.id);
    if (!headVersionId) {
      return NextResponse.json({ error: "Kartfilen saknar version" }, { status: 400 });
    }
    const init = await initImportPartialJob({
      userId: session.user.id,
      mapFileId: map.id,
      mapSlug: slug,
      headVersionId,
      fileName: body.filename,
    });
    return NextResponse.json(init);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Ogiltig uppladdning" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Välj en .ocd-fil" }, { status: 400 });
  }
  const validation = validateOcdUpload(file.name, file.size);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  if (shouldUseClientUpload(file.size)) {
    return NextResponse.json(
      {
        error: "Filen är för stor för direktuppladdning.",
        clientUploadRequired: true,
      },
      { status: 413 },
    );
  }

  try {
    const job = await createAndAnalyzeImportPartial({
      userId: session.user.id,
      mapFileId: map.id,
      mapSlug: slug,
      fileName: file.name,
      partialBuffer: Buffer.from(await file.arrayBuffer()),
    });
    return NextResponse.json({
      jobId: job.id,
      headVersionId: job.headVersionId,
      fileName: job.fileName,
      analysis: job.analysis,
    });
  } catch (err) {
    console.error("Import partial analyze failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kunde inte analysera delkartan" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (!canCheckout(session.user.role)) {
    return NextResponse.json({ error: "Endast redaktörer kan importera delkarta" }, { status: 403 });
  }

  const { slug } = await params;
  const map = await prisma.mapFile.findUnique({ where: { slug }, select: { id: true } });
  if (!map) {
    return NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 });
  }

  let body: { jobId?: string };
  try {
    body = (await request.json()) as { jobId?: string };
  } catch {
    return NextResponse.json({ error: "Ogiltig JSON" }, { status: 400 });
  }
  if (!body.jobId) {
    return NextResponse.json({ error: "jobId krävs" }, { status: 400 });
  }

  try {
    const job = await analyzeExistingImportPartialJob(body.jobId, session.user.id);
    if (job.mapFileId !== map.id) {
      return NextResponse.json({ error: "Jobbet tillhör ett annat område" }, { status: 403 });
    }
    return NextResponse.json({
      jobId: job.id,
      headVersionId: job.headVersionId,
      fileName: job.fileName,
      analysis: job.analysis,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kunde inte analysera delkartan" },
      { status: 400 },
    );
  }
}
