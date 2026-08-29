import { requireSession } from "@/lib/auth/api";
import { logAction } from "@/lib/audit";
import { runAfterResponse } from "@/lib/background";
import { assertVersionViewAccess } from "@/lib/maps/version-lookup";
import {
  computeVersionDiff,
  ensureDiffLayers,
  parseVersionDiffProgress,
  scheduleVersionCompare,
  VERSION_DIFF_STALE_MS,
} from "@/lib/ocad/process-version";
import type { OcadObjectChange } from "@/lib/ocad/diff-types";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

/** Stora kartor (t.ex. Mora Väst) kan behöva 10+ minuter för parsa + diff. */
export const maxDuration = 800;

type RouteParams = { params: Promise<{ slug: string }> };

type CompareResponseLayerPaths = {
  added: string;
  removed: string;
  modified: string;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
};

async function markCompareError(
  v1: string,
  v2: string,
  message: string,
  opts?: { runId?: string; startedAt?: string },
) {
  const current = await prisma.versionDiff.findUnique({
    where: { versionAId_versionBId: { versionAId: v1, versionBId: v2 } },
    select: { summaryJson: true, status: true },
  });
  if (current?.status === "OK") return;
  const currentProgress = parseVersionDiffProgress(current?.summaryJson);
  if (opts?.runId && currentProgress?.runId && currentProgress.runId !== opts.runId) {
    return;
  }
  await prisma.versionDiff.update({
    where: { versionAId_versionBId: { versionAId: v1, versionBId: v2 } },
    data: {
      status: "ERROR",
      summaryJson: JSON.stringify({
        error: message,
        progress: {
          step: "compute_diff",
          label: "Misslyckades",
          detail: message,
          updatedAt: new Date().toISOString(),
          runId: opts?.runId,
          startedAt: opts?.startedAt,
        },
      }),
    },
  });
}

function processingPayload(
  versionA: { id: string; versionNumber: number },
  versionB: { id: string; versionNumber: number },
  opts: {
    progress: ReturnType<typeof parseVersionDiffProgress>;
    stale: boolean;
    canRetry: boolean;
  },
) {
  return {
    status: "processing" as const,
    versionA: { id: versionA.id, versionNumber: versionA.versionNumber },
    versionB: { id: versionB.id, versionNumber: versionB.versionNumber },
    progress: opts.progress,
    stale: opts.stale,
    canRetry: opts.canRetry,
    staleAfterMs: VERSION_DIFF_STALE_MS,
  };
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

  let diffRecord = await prisma.versionDiff.findUnique({
    where: { versionAId_versionBId: { versionAId: v1, versionBId: v2 } },
  });

  if (!diffRecord || diffRecord.status === "PENDING" || diffRecord.status === "PROCESSING") {
    const scheduled = await scheduleVersionCompare(map.id, v1, v2);
    if (scheduled.started) {
      const runId = scheduled.runId;
      runAfterResponse(async () => {
        try {
          await computeVersionDiff(map.id, v1, v2, runId ? { runId } : undefined);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Diff misslyckades";
          console.error("Compare background job failed:", err);
          await markCompareError(v1, v2, message, {
            runId,
            startedAt: scheduled.progress?.startedAt,
          });
        }
      });
    }

    diffRecord = await prisma.versionDiff.findUnique({
      where: { versionAId_versionBId: { versionAId: v1, versionBId: v2 } },
    });

    const progress = parseVersionDiffProgress(diffRecord?.summaryJson) ?? scheduled.progress;
    return NextResponse.json(
      processingPayload(versionA, versionB, {
        progress,
        stale: scheduled.stale,
        canRetry: scheduled.stale || diffRecord?.status === "ERROR",
      }),
    );
  }

  if (diffRecord.status === "ERROR") {
    const errorInfo = diffRecord.summaryJson ? JSON.parse(diffRecord.summaryJson) : {};
    return NextResponse.json({
      status: "error",
      error: errorInfo.error ?? "Diff misslyckades",
      progress: parseVersionDiffProgress(diffRecord.summaryJson),
      canRetry: true,
    });
  }

  let summary = JSON.parse(diffRecord.summaryJson!) as Record<string, unknown>;

  if (summary.coordSpace !== "ocad-native") {
    // Omberäkna i bakgrunden — blockera inte GET (annars ser klienten bara «Laddar…»).
    const scheduled = await scheduleVersionCompare(map.id, v1, v2, { force: true });
    if (scheduled.started) {
      const runId = scheduled.runId;
      runAfterResponse(async () => {
        try {
          await computeVersionDiff(map.id, v1, v2, runId ? { runId } : undefined);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Diff misslyckades";
          console.error("Compare coord-space migration failed:", err);
          await markCompareError(v1, v2, message, {
            runId,
            startedAt: scheduled.progress?.startedAt,
          });
        }
      });
    }
    return NextResponse.json(
      processingPayload(versionA, versionB, {
        progress: scheduled.progress,
        stale: false,
        canRetry: false,
      }),
    );
  }

  if (!diffRecord || diffRecord.status !== "OK") {
    return NextResponse.json(
      processingPayload(versionA, versionB, {
        progress: parseVersionDiffProgress(diffRecord?.summaryJson),
        stale: false,
        canRetry: true,
      }),
    );
  }

  const changes = JSON.parse(diffRecord.changesJson ?? "[]") as OcadObjectChange[];

  // Generera saknade lager i bakgrunden — GET ska svara snabbt så statusdialogen syns.
  if (!summary.layerPaths) {
    runAfterResponse(async () => {
      try {
        await ensureDiffLayers(map.id, v1, v2, changes, summary);
      } catch (layerErr) {
        console.error("Kunde inte generera diff-lager:", layerErr);
      }
    });
  }

  await logAction(session.user.id, "COMPARE", "VersionDiff", diffRecord.id, {
    mapSlug: slug,
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
    summary,
    changes,
    layerPaths: (summary.layerPaths as CompareResponseLayerPaths) ?? null,
  });
}

export async function POST(request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const { slug } = await params;
  const body = await request.json().catch(() => ({}));
  const v1 = body.v1 as string | undefined;
  const v2 = body.v2 as string | undefined;
  const force = body.force === true;

  if (!v1 || !v2) {
    return NextResponse.json({ error: "Ange v1 och v2" }, { status: 400 });
  }

  const map = await prisma.mapFile.findUnique({ where: { slug } });
  if (!map) {
    return NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 });
  }

  try {
    const scheduled = await scheduleVersionCompare(map.id, v1, v2, { force: force || true });
    if (scheduled.started) {
      const runId = scheduled.runId;
      runAfterResponse(async () => {
        try {
          await computeVersionDiff(map.id, v1, v2, runId ? { runId } : undefined);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Diff misslyckades";
          await markCompareError(v1, v2, message, {
            runId,
            startedAt: scheduled.progress?.startedAt,
          });
        }
      });
    }
    return NextResponse.json({
      status: "processing",
      started: scheduled.started,
      progress: scheduled.progress,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Diff misslyckades";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
