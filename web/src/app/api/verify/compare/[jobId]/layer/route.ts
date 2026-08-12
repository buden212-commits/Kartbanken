import { requireSession } from "@/lib/auth/api";
import { readTempCompareJob } from "@/lib/ocad/temp-compare";
import { readStoredFile } from "@/lib/storage";
import { SVG_RESPONSE_SECURITY_HEADERS } from "@/lib/security/svg-sanitize";
import { NextResponse } from "next/server";

export const maxDuration = 300;

type RouteParams = { params: Promise<{ jobId: string }> };

const VALID_LAYERS = new Set(["added", "removed", "modified"]);

export async function GET(request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const { jobId } = await params;
  const { searchParams } = new URL(request.url);
  const layer = searchParams.get("layer");

  if (!layer || !VALID_LAYERS.has(layer)) {
    return NextResponse.json(
      { error: "Ange layer (added|removed|modified)" },
      { status: 400 },
    );
  }

  const job = await readTempCompareJob(jobId);

  if (!job) {
    return NextResponse.json({ error: "Jämförelsen hittades inte" }, { status: 404 });
  }

  if (job.userId !== session.user.id) {
    return NextResponse.json({ error: "Åtkomst nekad" }, { status: 403 });
  }

  const storagePath = job.summary?.layerPaths?.[layer as keyof typeof job.summary.layerPaths];
  if (!storagePath || typeof storagePath !== "string") {
    return NextResponse.json({ error: "Kartlager saknas" }, { status: 404 });
  }

  try {
    const svg = await readStoredFile(storagePath);
    return new NextResponse(new Uint8Array(svg), {
      headers: {
        ...SVG_RESPONSE_SECURITY_HEADERS,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Kartlager kunde inte läsas" }, { status: 404 });
  }
}
