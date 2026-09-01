import { requireSession } from "@/lib/auth/api";
import { logAction } from "@/lib/audit";
import { deriveCompareProcessingProgress } from "@/lib/compare/processing-progress";
import {
  ensureVersionDiffReady,
  hasLiveWorker,
  readDiffStage,
} from "@/lib/compare/ensure-version-diff";
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

type VersionSummary = {
  id: string;
  versionNumber: number;
  isPublished: boolean;
  originalFilename: string;
};

const versionSelect = {
  id: true,
  versionNumber: true,
  isPublished: true,
  originalFilename: true,
} as const;

async function compareProcessingPayload(
  mapId: string,
  v1: string,
  v2: string,
  versionA: VersionSummary,
  versionB: VersionSummary,
) {
  const [fullA, fullB, diffRecord] = await Promise.all([
    prisma.mapVersion.findFirst({
      where: { id: v1, mapFileId: mapId },
      select: { versionNumber: true, parseStatus: true },
    }),
    prisma.mapVersion.findFirst({
      where: { id: v2, mapFileId: mapId },
      select: { versionNumber: true, parseStatus: true },
    }),
    prisma.versionDiff.findUnique({
      where: { versionAId_versionBId: { versionAId: v1, versionBId: v2 } },
      select: { status: true, summaryJson: true, createdAt: true },
    }),
  ]);

  return NextResponse.json({
    status: "processing" as const,
    versionA: { id: versionA.id, versionNumber: versionA.versionNumber },
    versionB: { id: versionB.id, versionNumber: versionB.versionNumber },
    workerActive: diffRecord ? hasLiveWorker(diffRecord) : false,
    progress:
      fullA && fullB
        ? deriveCompareProcessingProgress(
            fullA,
            fullB,
            readDiffStage(diffRecord?.summaryJson ?? null),
          )
        : null,
  });
}

async function compareOkPayload(
  map: { id: string; slug: string },
  v1: string,
  v2: string,
  versionA: VersionSummary,
  versionB: VersionSummary,
  userId: string,
  options?: { buildMissingLayers?: boolean },
) {
  const diffRecord = await prisma.versionDiff.findUnique({
    where: { versionAId_versionBId: { versionAId: v1, versionBId: v2 } },
  });

  if (!diffRecord || diffRecord.status !== "OK" || !diffRecord.summaryJson) {
    return compareProcessingPayload(map.id, v1, v2, versionA, versionB);
  }

  let summary = JSON.parse(diffRecord.summaryJson) as Record<string, unknown>;
  let changesJson = diffRecord.changesJson;

  if (summary.coordSpace !== "ocad-native") {
    try {
      await computeVersionDiff(map.id, v1, v2);
      const refreshed = await prisma.versionDiff.findUnique({
        where: { versionAId_versionBId: { versionAId: v1, versionBId: v2 } },
      });
      if (!refreshed?.summaryJson) {
        return compareProcessingPayload(map.id, v1, v2, versionA, versionB);
      }
      summary = JSON.parse(refreshed.summaryJson) as Record<string, unknown>;
      changesJson = refreshed.changesJson;
    } catch (recomputeErr) {
      console.error("Kunde inte migrera diff-koordinater:", recomputeErr);
    }
  }

  const changes = JSON.parse(changesJson ?? "[]") as OcadObjectChange[];

  let finalSummary = summary;
  if (options?.buildMissingLayers && !summary.layerPaths) {
    try {
      finalSummary = await ensureDiffLayers(map.id, v1, v2, changes, summary);
    } catch (layerErr) {
      console.error("Kunde inte generera diff-lager:", layerErr);
    }
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

type ResolvedCompareRequest =
  | { error: NextResponse }
  | {
      map: { id: string; slug: string };
      v1: string;
      v2: string;
      versionA: VersionSummary;
      versionB: VersionSummary;
    };

async function resolveCompareRequest(
  slug: string,
  v1: string | null,
  v2: string | null,
  session: Awaited<ReturnType<typeof requireSession>>,
): Promise<ResolvedCompareRequest> {
  if (!v1 || !v2) {
    return {
      error: NextResponse.json({ error: "Ange v1 och v2 (versions-id)" }, { status: 400 }),
    };
  }

  const map = await prisma.mapFile.findUnique({
    where: { slug },
    select: { id: true, slug: true },
  });
  if (!map) {
    return { error: NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 }) };
  }

  const [versionA, versionB] = await Promise.all([
    prisma.mapVersion.findFirst({ where: { id: v1, mapFileId: map.id }, select: versionSelect }),
    prisma.mapVersion.findFirst({ where: { id: v2, mapFileId: map.id }, select: versionSelect }),
  ]);

  if (!versionA || !versionB) {
    return { error: NextResponse.json({ error: "Version hittades inte" }, { status: 404 }) };
  }

  const typedSession = session as Exclude<typeof session, NextResponse>;
  const deniedA = assertVersionViewAccess(typedSession, versionA);
  if (deniedA) return { error: deniedA };
  const deniedB = assertVersionViewAccess(typedSession, versionB);
  if (deniedB) return { error: deniedB };

  if (versionA.versionNumber >= versionB.versionNumber) {
    return {
      error: NextResponse.json({ error: "v1 måste vara äldre version än v2" }, { status: 400 }),
    };
  }

  return { map, v1, v2, versionA, versionB };
}

/**
 * Snabb statuskontroll. Startar aldrig beräkningen — klienten gör det via POST
 * så att polling kan svara direkt och visa vilken etapp som pågår.
 */
export async function GET(request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const { slug } = await params;
  const { searchParams } = new URL(request.url);
  const resolved = await resolveCompareRequest(
    slug,
    searchParams.get("v1"),
    searchParams.get("v2"),
    session,
  );
  if ("error" in resolved) return resolved.error;

  const { map, v1, v2, versionA, versionB } = resolved;

  const diffRecord = await prisma.versionDiff.findUnique({
    where: { versionAId_versionBId: { versionAId: v1, versionBId: v2 } },
    select: { status: true, summaryJson: true },
  });

  if (diffRecord?.status === "ERROR") {
    let error = "Diff misslyckades";
    try {
      const info = diffRecord.summaryJson ? JSON.parse(diffRecord.summaryJson) : {};
      if (typeof info.error === "string") error = info.error;
    } catch {
      // behåll standardmeddelandet
    }
    return NextResponse.json({ status: "error", error });
  }

  if (diffRecord?.status !== "OK") {
    return compareProcessingPayload(map.id, v1, v2, versionA, versionB);
  }

  return compareOkPayload(map, v1, v2, versionA, versionB, session.user.id);
}

/** Utför beräkningen i anropet. Kan ta flera minuter på stora kartor. */
export async function POST(request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const { slug } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    v1?: string;
    v2?: string;
    force?: boolean;
  };

  const resolved = await resolveCompareRequest(slug, body.v1 ?? null, body.v2 ?? null, session);
  if ("error" in resolved) return resolved.error;

  const { map, v1, v2, versionA, versionB } = resolved;

  const diffState = await ensureVersionDiffReady(map.id, v1, v2, { force: body.force === true });

  if (diffState.status === "error") {
    return NextResponse.json({ status: "error", error: diffState.error });
  }

  if (diffState.status === "processing") {
    return compareProcessingPayload(map.id, v1, v2, versionA, versionB);
  }

  return compareOkPayload(map, v1, v2, versionA, versionB, session.user.id, {
    buildMissingLayers: true,
  });
}
