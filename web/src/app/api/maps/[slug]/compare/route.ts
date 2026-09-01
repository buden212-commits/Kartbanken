import { requireSession } from "@/lib/auth/api";
import { logAction } from "@/lib/audit";
import { deriveCompareProcessingProgress } from "@/lib/compare/processing-progress";
import { ensureVersionDiffReady } from "@/lib/compare/ensure-version-diff";
import { assertVersionViewAccess } from "@/lib/maps/version-lookup";
import { computeVersionDiff, ensureDiffLayers } from "@/lib/ocad/process-version";
import type { OcadObjectChange } from "@/lib/ocad/diff-types";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const maxDuration = 300;

type RouteParams = { params: Promise<{ slug: string }> };

type CompareResponseLayerPaths = {
  added: string;
  removed: string;
  modified: string;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
};

const versionProgressSelect = {
  versionNumber: true,
  parseStatus: true,
  tileStatus: true,
  tileBuildTotal: true,
  tileBuildDone: true,
  tileBuildCurrentZ: true,
  tileBuildMaxZPregen: true,
} as const;

async function compareProcessingPayload(
  mapId: string,
  v1: string,
  v2: string,
  versionA: { id: string; versionNumber: number },
  versionB: { id: string; versionNumber: number },
) {
  const [fullA, fullB] = await Promise.all([
    prisma.mapVersion.findFirst({
      where: { id: v1, mapFileId: mapId },
      select: versionProgressSelect,
    }),
    prisma.mapVersion.findFirst({
      where: { id: v2, mapFileId: mapId },
      select: versionProgressSelect,
    }),
  ]);

  return {
    status: "processing" as const,
    versionA,
    versionB,
    progress:
      fullA && fullB ? deriveCompareProcessingProgress(fullA, fullB) : null,
  };
}

async function buildCompareOkResponse(
  map: { id: string; slug: string },
  v1: string,
  v2: string,
  versionA: { id: string; versionNumber: number; originalFilename: string },
  versionB: { id: string; versionNumber: number; originalFilename: string },
  userId: string,
) {
  let diffRecord = await prisma.versionDiff.findUnique({
    where: { versionAId_versionBId: { versionAId: v1, versionBId: v2 } },
  });

  if (!diffRecord || diffRecord.status !== "OK" || !diffRecord.summaryJson) {
    return NextResponse.json(
      await compareProcessingPayload(map.id, v1, v2, {
        id: versionA.id,
        versionNumber: versionA.versionNumber,
      }, {
        id: versionB.id,
        versionNumber: versionB.versionNumber,
      }),
    );
  }

  let summary = JSON.parse(diffRecord.summaryJson) as Record<string, unknown>;

  if (summary.coordSpace !== "ocad-native") {
    try {
      await computeVersionDiff(map.id, v1, v2);
      const refreshed = await prisma.versionDiff.findUnique({
        where: { versionAId_versionBId: { versionAId: v1, versionBId: v2 } },
      });
      if (!refreshed?.summaryJson) {
        return NextResponse.json(
          await compareProcessingPayload(map.id, v1, v2, {
            id: versionA.id,
            versionNumber: versionA.versionNumber,
          }, {
            id: versionB.id,
            versionNumber: versionB.versionNumber,
          }),
        );
      }
      diffRecord = refreshed;
      summary = JSON.parse(refreshed.summaryJson) as Record<string, unknown>;
    } catch (recomputeErr) {
      console.error("Kunde inte migrera diff-koordinater:", recomputeErr);
    }
  }

  const changes = JSON.parse(diffRecord.changesJson ?? "[]") as OcadObjectChange[];

  let finalSummary = summary;
  try {
    finalSummary = await ensureDiffLayers(map.id, v1, v2, changes, summary);
  } catch (layerErr) {
    console.error("Kunde inte generera diff-lager:", layerErr);
  }

  await logAction(userId, "COMPARE", "VersionDiff", diffRecord.id, {
    mapSlug: map.slug,
    v1: versionA.versionNumber,
    v2: versionB.versionNumber,
  });

  return NextResponse.json({
    status: "ok",
    versionA: {
      id: versionA.id,
      versionNumber: versionA.versionNumber,
      fileName: versionA.originalFilename,
    },
    versionB: {
      id: versionB.id,
      versionNumber: versionB.versionNumber,
      fileName: versionB.originalFilename,
    },
    summary: finalSummary,
    changes,
    layerPaths: (finalSummary.layerPaths as CompareResponseLayerPaths) ?? null,
  });
}

export async function GET(request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const { slug } = await params;
  const { searchParams } = new URL(request.url);
  const v1 = searchParams.get("v1");
  const v2 = searchParams.get("v2");

  if (!v1 || !v2) {
    return NextResponse.json({ error: "Ange v1 och v2 (versions-id)" }, { status: 400 });
  }

  const map = await prisma.mapFile.findUnique({ where: { slug } });
  if (!map) {
    return NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 });
  }

  const [versionA, versionB] = await Promise.all([
    prisma.mapVersion.findFirst({
      where: { id: v1, mapFileId: map.id },
      select: { id: true, versionNumber: true, isPublished: true, originalFilename: true },
    }),
    prisma.mapVersion.findFirst({
      where: { id: v2, mapFileId: map.id },
      select: { id: true, versionNumber: true, isPublished: true, originalFilename: true },
    }),
  ]);

  if (!versionA || !versionB) {
    return NextResponse.json({ error: "Version hittades inte" }, { status: 404 });
  }

  const deniedA = assertVersionViewAccess(session, versionA);
  if (deniedA) return deniedA;
  const deniedB = assertVersionViewAccess(session, versionB);
  if (deniedB) return deniedB;

  if (versionA.versionNumber >= versionB.versionNumber) {
    return NextResponse.json(
      { error: "v1 måste vara äldre version än v2" },
      { status: 400 },
    );
  }

  const diffState = await ensureVersionDiffReady(map.id, v1, v2);

  if (diffState.status === "processing") {
    return NextResponse.json(
      await compareProcessingPayload(map.id, v1, v2, {
        id: versionA.id,
        versionNumber: versionA.versionNumber,
      }, {
        id: versionB.id,
        versionNumber: versionB.versionNumber,
      }),
    );
  }

  if (diffState.status === "error") {
    return NextResponse.json({
      status: "error",
      error: diffState.error,
    });
  }

  return buildCompareOkResponse(map, v1, v2, versionA, versionB, session.user.id);
}

export async function POST(request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const { slug } = await params;
  const body = await request.json().catch(() => ({}));
  const v1 = body.v1 as string | undefined;
  const v2 = body.v2 as string | undefined;

  if (!v1 || !v2) {
    return NextResponse.json({ error: "Ange v1 och v2" }, { status: 400 });
  }

  const map = await prisma.mapFile.findUnique({ where: { slug } });
  if (!map) {
    return NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 });
  }

  const [versionA, versionB] = await Promise.all([
    prisma.mapVersion.findFirst({
      where: { id: v1, mapFileId: map.id },
      select: { id: true, versionNumber: true, isPublished: true, originalFilename: true },
    }),
    prisma.mapVersion.findFirst({
      where: { id: v2, mapFileId: map.id },
      select: { id: true, versionNumber: true, isPublished: true, originalFilename: true },
    }),
  ]);

  if (!versionA || !versionB) {
    return NextResponse.json({ error: "Version hittades inte" }, { status: 404 });
  }

  const deniedA = assertVersionViewAccess(session, versionA);
  if (deniedA) return deniedA;
  const deniedB = assertVersionViewAccess(session, versionB);
  if (deniedB) return deniedB;

  const diffState = await ensureVersionDiffReady(map.id, v1, v2, { force: true });

  if (diffState.status === "error") {
    return NextResponse.json({ error: diffState.error }, { status: 500 });
  }

  if (diffState.status === "processing") {
    return NextResponse.json({ status: "processing" });
  }

  return buildCompareOkResponse(map, v1, v2, versionA, versionB, session.user.id);
}
