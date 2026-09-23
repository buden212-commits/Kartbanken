import { runAfterResponse } from "@/lib/background";
import { prisma } from "@/lib/prisma";
import {
  computeCheckoutSubsetDiff,
  storeCheckoutDiffSummary,
} from "./subset-diff";
import type { CheckoutSubsetDiffResult } from "./subset-diff";
import { CheckoutStatus } from "./types";
import { parseSelectionJson } from "./types";

const CHECKOUT_DIFF_STATUSES: CheckoutStatus[] = [
  CheckoutStatus.CHECKED_IN,
  CheckoutStatus.PENDING_ADMIN_CONFIRM,
];

/**
 * Lease så parallella pollar/POST inte kör om en beräkning som redan pågår.
 * Matchar maxDuration för diff-API-routen (300 s).
 */
const CHECKOUT_DIFF_LEASE_MS = 5 * 60 * 1000;

/** Efter detta markeras diffen som fel så användaren kan starta om manuellt. */
const CHECKOUT_DIFF_STALE_MS = 12 * 60 * 1000;

export const CHECKOUT_DIFF_STALE_MESSAGE =
  "Diff-beräkningen tog för lång tid. Försök beräkna igen — om problemet kvarstår kan filen vara för stor.";

export type CheckoutDiffLayerPaths = {
  added: string;
  removed: string;
  modified: string;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
};

export type CheckoutDiffSummary = {
  added: number;
  removed: number;
  modified: number;
  headVersionId?: string;
  baseVersionId?: string;
  headChangedSinceCheckout?: boolean;
  outOfScopeWarnings?: string[];
  bySymbol?: Record<string, { added: number; removed: number; modified: number }>;
  changes?: unknown[];
  layerPaths?: CheckoutDiffLayerPaths | null;
  computedAt?: string;
};

type DiffMetaPending = {
  _status: "pending";
  startedAt: string;
  /** När aktuell after()-körning claimade jobbet (lease). Saknas tills jobbet faktiskt startat. */
  attemptStartedAt?: string;
};
type DiffMetaError = { _status: "error"; error: string; failedAt: string };

export type ParsedCheckoutDiff =
  | { status: "not_applicable" }
  | { status: "pending"; startedAt: string | null; objectCount: number }
  | { status: "error"; error: string; failedAt: string | null; objectCount: number }
  | { status: "ready"; summary: CheckoutDiffSummary; objectCount: number };

function parseDiffMeta(raw: string | null | undefined):
  | { kind: "pending"; startedAt: string | null; attemptStartedAt: string | null }
  | { kind: "error"; error: string; failedAt: string | null }
  | { kind: "ready"; summary: CheckoutDiffSummary }
  | { kind: "empty" } {
  if (!raw) return { kind: "empty" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: "empty" };
  }

  if (!parsed || typeof parsed !== "object") return { kind: "empty" };

  const record = parsed as Record<string, unknown>;
  if (record._status === "pending") {
    const meta = record as DiffMetaPending;
    return {
      kind: "pending",
      startedAt: meta.startedAt ?? null,
      attemptStartedAt:
        typeof meta.attemptStartedAt === "string" ? meta.attemptStartedAt : null,
    };
  }
  if (record._status === "error") {
    const meta = record as DiffMetaError;
    return {
      kind: "error",
      error: meta.error ?? "Diff-beräkning misslyckades",
      failedAt: meta.failedAt ?? null,
    };
  }

  if (typeof record.added === "number" && typeof record.removed === "number") {
    return { kind: "ready", summary: record as CheckoutDiffSummary };
  }

  return { kind: "empty" };
}

/** Parse stored checkout diff JSON (ignores pending/error meta). */
export function parseStoredCheckoutDiffJson(
  raw: string | null | undefined,
): CheckoutSubsetDiffResult | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;

  const record = parsed as Record<string, unknown>;
  if (record._status === "pending" || record._status === "error") return null;
  if (typeof record.added !== "number" || typeof record.removed !== "number") return null;
  if (!Array.isArray(record.changes)) return null;

  return parsed as CheckoutSubsetDiffResult;
}

export function isCheckoutDiffApplicable(checkout: {
  status: string;
  checkinStoragePath: string | null;
}): boolean {
  return (
    CHECKOUT_DIFF_STATUSES.includes(checkout.status as CheckoutStatus) &&
    Boolean(checkout.checkinStoragePath)
  );
}

export function parseCheckoutDiffFromRecord(checkout: {
  status: string;
  checkinStoragePath: string | null;
  diffSummaryJson: string | null;
  selectionJson: string;
}): ParsedCheckoutDiff {
  const objectCount = parseSelectionJson(checkout.selectionJson).objectIds.length;

  if (!isCheckoutDiffApplicable(checkout)) {
    return { status: "not_applicable" };
  }

  const meta = parseDiffMeta(checkout.diffSummaryJson);
  if (meta.kind === "ready") {
    return { status: "ready", summary: meta.summary, objectCount };
  }
  if (meta.kind === "error") {
    return {
      status: "error",
      error: meta.error,
      failedAt: meta.failedAt,
      objectCount,
    };
  }
  if (meta.kind === "pending") {
    return { status: "pending", startedAt: meta.startedAt, objectCount };
  }

  return { status: "pending", startedAt: null, objectCount };
}

export async function markCheckoutDiffPending(checkoutId: string): Promise<void> {
  await prisma.mapCheckout.update({
    where: { id: checkoutId },
    data: {
      diffSummaryJson: JSON.stringify({
        _status: "pending",
        startedAt: new Date().toISOString(),
      } satisfies DiffMetaPending),
    },
  });
}

export async function storeCheckoutDiffError(checkoutId: string, err: unknown): Promise<void> {
  const message =
    err instanceof Error ? err.message : "Diff-beräkning misslyckades av okänd anledning";

  await prisma.mapCheckout.update({
    where: { id: checkoutId },
    data: {
      diffSummaryJson: JSON.stringify({
        _status: "error",
        error: message,
        failedAt: new Date().toISOString(),
      } satisfies DiffMetaError),
    },
  });
}

export function isCheckoutDiffStale(parsed: ParsedCheckoutDiff): boolean {
  if (parsed.status !== "pending") return false;
  if (!parsed.startedAt) return false;
  const started = Date.parse(parsed.startedAt);
  if (Number.isNaN(started)) return false;
  return Date.now() - started > CHECKOUT_DIFF_STALE_MS;
}

/**
 * Kör subset-diff med lease. Anropas inline från GET/POST /diff (och ev. after()
 * som fallback efter incheckning). Flera pollar kan träffa samtidigt; bara en
 * claimad körning beräknar.
 */
export async function runCheckoutSubsetDiffJob(checkoutId: string): Promise<void> {
  const checkout = await prisma.mapCheckout.findUnique({
    where: { id: checkoutId },
    select: {
      status: true,
      checkinStoragePath: true,
      diffSummaryJson: true,
    },
  });

  if (!checkout?.checkinStoragePath) return;
  if (!CHECKOUT_DIFF_STATUSES.includes(checkout.status as CheckoutStatus)) return;

  const meta = parseDiffMeta(checkout.diffSummaryJson);
  if (meta.kind === "ready" || meta.kind === "error") return;

  const startedAt = meta.kind === "pending" ? meta.startedAt : null;
  const attemptStartedAt = meta.kind === "pending" ? meta.attemptStartedAt : null;

  if (startedAt) {
    const overallAge = Date.now() - Date.parse(startedAt);
    if (!Number.isNaN(overallAge) && overallAge > CHECKOUT_DIFF_STALE_MS) {
      await storeCheckoutDiffError(checkoutId, new Error(CHECKOUT_DIFF_STALE_MESSAGE));
      return;
    }
  }

  if (attemptStartedAt) {
    const leaseAge = Date.now() - Date.parse(attemptStartedAt);
    if (!Number.isNaN(leaseAge) && leaseAge < CHECKOUT_DIFF_LEASE_MS) {
      return;
    }
  }

  const now = new Date().toISOString();
  await prisma.mapCheckout.update({
    where: { id: checkoutId },
    data: {
      diffSummaryJson: JSON.stringify({
        _status: "pending",
        startedAt: startedAt ?? now,
        attemptStartedAt: now,
      } satisfies DiffMetaPending),
    },
  });

  try {
    const diff = await computeCheckoutSubsetDiff(checkoutId);
    await storeCheckoutDiffSummary(checkoutId, diff);
  } catch (err) {
    console.error("Checkout subset diff failed:", err);
    await storeCheckoutDiffError(checkoutId, err);
  }
}

/**
 * Best-effort bakgrundsstart efter incheckning. Pålitlig körning sker inline via
 * GET/POST /diff (klienten pollar) — after() dör ofta tyst på Vercel.
 */
export function scheduleCheckoutSubsetDiff(checkoutId: string): void {
  runAfterResponse(async () => {
    try {
      await runCheckoutSubsetDiffJob(checkoutId);
    } catch (err) {
      console.error("Checkout subset diff failed:", err);
      await storeCheckoutDiffError(checkoutId, err);
    }
  });
}
