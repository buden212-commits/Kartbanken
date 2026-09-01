import type { CompareProcessingStage } from "@/lib/compare/processing-progress";
import { computeVersionDiff } from "@/lib/ocad/process-version";
import { prisma } from "@/lib/prisma";

/**
 * Så länge ett anrop hunnit rapportera framsteg nyligen antas det fortfarande köra.
 * Vercel avbryter funktionen efter 300 s, så en tystnad längre än så betyder att
 * körningen dog och att nästa anrop ska ta över i stället för att vänta för alltid.
 */
const STAGE_HEARTBEAT_TIMEOUT_MS = 6 * 60 * 1000;

type DiffProcessingMeta = {
  processingStartedAt?: string;
  stageUpdatedAt?: string;
  stage?: CompareProcessingStage;
  error?: string;
};

/** Meta finns bara medan diffen körs eller misslyckats — klara diffar har numeriska fält. */
function parseDiffMeta(summaryJson: string | null): DiffProcessingMeta {
  if (!summaryJson) return {};
  try {
    const parsed = JSON.parse(summaryJson) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return {};
    if (typeof parsed.added === "number") return {};
    return {
      processingStartedAt:
        typeof parsed.processingStartedAt === "string" ? parsed.processingStartedAt : undefined,
      stageUpdatedAt:
        typeof parsed.stageUpdatedAt === "string" ? parsed.stageUpdatedAt : undefined,
      stage:
        parsed.stage === "parse" || parsed.stage === "diff" || parsed.stage === "layers"
          ? parsed.stage
          : undefined,
      error: typeof parsed.error === "string" ? parsed.error : undefined,
    };
  } catch {
    return {};
  }
}

export function readDiffStage(summaryJson: string | null): CompareProcessingStage | null {
  return parseDiffMeta(summaryJson).stage ?? null;
}

function lastHeartbeatMs(diffRecord: {
  createdAt: Date;
  summaryJson: string | null;
}): number {
  const meta = parseDiffMeta(diffRecord.summaryJson);
  for (const value of [meta.stageUpdatedAt, meta.processingStartedAt]) {
    if (!value) continue;
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return diffRecord.createdAt.getTime();
}

/** True medan ett annat anrop rapporterar framsteg — då ska vi vänta i stället för att dubbelköra. */
export function hasLiveWorker(diffRecord: {
  createdAt: Date;
  summaryJson: string | null;
  status: string;
}): boolean {
  if (diffRecord.status !== "PROCESSING" && diffRecord.status !== "PENDING") return false;
  return Date.now() - lastHeartbeatMs(diffRecord) < STAGE_HEARTBEAT_TIMEOUT_MS;
}

async function claimProcessing(
  mapFileId: string,
  versionAId: string,
  versionBId: string,
  meta: DiffProcessingMeta,
): Promise<void> {
  const summaryJson = JSON.stringify(meta);
  await prisma.versionDiff.upsert({
    where: { versionAId_versionBId: { versionAId, versionBId } },
    create: {
      mapFileId,
      versionAId,
      versionBId,
      status: "PROCESSING",
      summaryJson,
    },
    update: { status: "PROCESSING", summaryJson },
  });
}

/**
 * Uppdatera etapp utan att skriva över ett färdigt resultat — diffen sparas som
 * klar innan kartlagren renderas, och den hjärtslagsuppdateringen får inte
 * återställa posten till PROCESSING.
 */
async function updateStage(
  versionAId: string,
  versionBId: string,
  meta: DiffProcessingMeta,
): Promise<void> {
  await prisma.versionDiff.updateMany({
    where: {
      versionAId,
      versionBId,
      status: { in: ["PENDING", "PROCESSING"] },
    },
    data: { summaryJson: JSON.stringify(meta) },
  });
}

async function markVersionDiffError(
  mapFileId: string,
  versionAId: string,
  versionBId: string,
  error: string,
): Promise<void> {
  const summaryJson = JSON.stringify({ error });
  await prisma.versionDiff.upsert({
    where: { versionAId_versionBId: { versionAId, versionBId } },
    create: {
      mapFileId,
      versionAId,
      versionBId,
      status: "ERROR",
      summaryJson,
    },
    update: { status: "ERROR", summaryJson },
  });
}

export type EnsureVersionDiffResult =
  | { status: "ok" }
  | { status: "processing" }
  | { status: "error"; error: string };

/**
 * Säkerställ att diffen mellan två versioner är beräknad.
 * Arbetet körs i anropet (inte som bakgrundsjobb) eftersom bakgrundsjobb
 * avbryts av plattformen innan de hinner klart på stora kartor.
 */
export async function ensureVersionDiffReady(
  mapFileId: string,
  versionAId: string,
  versionBId: string,
  options?: { force?: boolean },
): Promise<EnsureVersionDiffResult> {
  const force = options?.force ?? false;

  const diffRecord = await prisma.versionDiff.findUnique({
    where: { versionAId_versionBId: { versionAId, versionBId } },
  });

  if (diffRecord?.status === "OK" && !force) {
    return { status: "ok" };
  }

  if (diffRecord?.status === "ERROR" && !force) {
    const meta = parseDiffMeta(diffRecord.summaryJson);
    return { status: "error", error: meta.error ?? "Diff misslyckades" };
  }

  if (!force && diffRecord && hasLiveWorker(diffRecord)) {
    return { status: "processing" };
  }

  const processingStartedAt = new Date().toISOString();
  await claimProcessing(mapFileId, versionAId, versionBId, {
    processingStartedAt,
    stageUpdatedAt: processingStartedAt,
    stage: "parse",
  });

  try {
    await computeVersionDiff(mapFileId, versionAId, versionBId, async (stage) => {
      await updateStage(versionAId, versionBId, {
        processingStartedAt,
        stageUpdatedAt: new Date().toISOString(),
        stage,
      });
    });
    return { status: "ok" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Diff misslyckades";
    await markVersionDiffError(mapFileId, versionAId, versionBId, message);
    return { status: "error", error: message };
  }
}
