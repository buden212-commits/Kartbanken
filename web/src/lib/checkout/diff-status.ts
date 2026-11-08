import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  computeCheckoutSubsetDiff,
  storeCheckoutDiffSummary,
} from "./subset-diff";
import type { CheckoutSubsetDiffResult } from "./subset-diff";
import { CheckoutStatus } from "./types";
import { parseSelectionJson } from "./types";

/** Statuses where a diff can be (re)computed. */
const CHECKOUT_DIFF_STATUSES: CheckoutStatus[] = [
  CheckoutStatus.CHECKED_IN,
  CheckoutStatus.PENDING_ADMIN_CONFIRM,
];

/** Statuses where an already computed diff is shown (integration keeps displaying it). */
const CHECKOUT_DIFF_DISPLAY_STATUSES: CheckoutStatus[] = [
  ...CHECKOUT_DIFF_STATUSES,
  CheckoutStatus.INTEGRATING,
];

/**
 * Lease so parallel POSTs do not start a second computation while one runs.
 * Must be at least the route's maxDuration (300 s); a shorter lease lets a second
 * invocation steal a still-running job.
 */
export const CHECKOUT_DIFF_LEASE_MS = 300 * 1000;

/** Number of attempts that may expire before the diff is marked as failed. */
export const CHECKOUT_DIFF_MAX_ATTEMPTS = 2;

/** Max changes returned by GET /diff; the full list stays in the database. */
export const CHECKOUT_DIFF_RESPONSE_MAX_CHANGES = 2000;

export const CHECKOUT_DIFF_STALE_MESSAGE =
  "Diff-beräkningen tog för lång tid. Försök beräkna igen — om problemet kvarstår kan filen vara för stor.";

export type CheckoutDiffLayerPaths = {
  added: string;
  removed: string;
  modified: string;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  checkin?: string;
  checkinClip?: { minX: number; minY: number; maxX: number; maxY: number };
};

export type CheckoutDiffSummary = {
  added: number;
  removed: number;
  modified: number;
  headVersionId?: string;
  baseVersionId?: string;
  headChangedSinceCheckout?: boolean;
  outOfScopeWarnings?: string[];
  validationWarnings?: string[];
  blockingErrors?: string[];
  bySymbol?: Record<string, { added: number; removed: number; modified: number }>;
  changes?: unknown[];
  layerPaths?: CheckoutDiffLayerPaths | null;
  checkinStoragePath?: string;
  computedAt?: string;
  /** Set on GET responses when `changes` was cut to CHECKOUT_DIFF_RESPONSE_MAX_CHANGES. */
  totalChanges?: number;
  changesTruncated?: boolean;
};

type DiffMetaPending = {
  _status: "pending";
  startedAt: string;
  /** Checkin file this pending diff belongs to. */
  checkinStoragePath?: string;
  /** Identifies the running attempt; results are only stored while it still matches. */
  attemptId?: string;
  /** When the current attempt claimed the job (lease). Missing until a job actually starts. */
  attemptStartedAt?: string;
  attempts?: number;
};
type DiffMetaError = {
  _status: "error";
  error: string;
  failedAt: string;
  checkinStoragePath?: string;
};

export type ParsedCheckoutDiff =
  | { status: "not_applicable" }
  | { status: "pending"; startedAt: string | null; objectCount: number }
  | { status: "error"; error: string; failedAt: string | null; objectCount: number }
  | { status: "ready"; summary: CheckoutDiffSummary; objectCount: number };

type ParsedDiffMeta =
  | {
      kind: "pending";
      startedAt: string | null;
      attemptStartedAt: string | null;
      attemptId: string | null;
      attempts: number;
      checkinStoragePath: string | null;
    }
  | { kind: "error"; error: string; failedAt: string | null }
  | { kind: "ready"; summary: CheckoutDiffSummary }
  | { kind: "empty" };

function parseDiffMeta(raw: string | null | undefined): ParsedDiffMeta {
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
      attemptId: typeof meta.attemptId === "string" ? meta.attemptId : null,
      attempts: typeof meta.attempts === "number" ? meta.attempts : 0,
      checkinStoragePath:
        typeof meta.checkinStoragePath === "string" ? meta.checkinStoragePath : null,
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
    CHECKOUT_DIFF_DISPLAY_STATUSES.includes(checkout.status as CheckoutStatus) &&
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
    if (
      meta.summary.checkinStoragePath &&
      meta.summary.checkinStoragePath !== checkout.checkinStoragePath
    ) {
      // Diff from an earlier checkin; a new one has to be computed.
      return { status: "pending", startedAt: null, objectCount };
    }
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

/** Summary for API responses: caps the change list so polling stays light. */
export function truncateDiffSummaryForResponse(
  summary: CheckoutDiffSummary,
  maxChanges = CHECKOUT_DIFF_RESPONSE_MAX_CHANGES,
): CheckoutDiffSummary {
  const changes = Array.isArray(summary.changes) ? summary.changes : [];
  if (changes.length <= maxChanges) {
    return { ...summary, totalChanges: changes.length, changesTruncated: false };
  }
  return {
    ...summary,
    changes: changes.slice(0, maxChanges),
    totalChanges: changes.length,
    changesTruncated: true,
  };
}

export async function markCheckoutDiffPending(
  checkoutId: string,
  checkinStoragePath?: string | null,
): Promise<void> {
  await prisma.mapCheckout.update({
    where: { id: checkoutId },
    data: {
      diffSummaryJson: JSON.stringify({
        _status: "pending",
        startedAt: new Date().toISOString(),
        ...(checkinStoragePath ? { checkinStoragePath } : {}),
      } satisfies DiffMetaPending),
    },
  });
}

/** Guard so a slow attempt never overwrites the state of a newer checkin or attempt. */
export type CheckoutDiffWriteGuard = {
  checkinStoragePath: string;
  attemptId: string;
};

function guardWhere(checkoutId: string, guard: CheckoutDiffWriteGuard | undefined) {
  if (!guard) return { id: checkoutId };
  return {
    id: checkoutId,
    checkinStoragePath: guard.checkinStoragePath,
    diffSummaryJson: { contains: `"attemptId":${JSON.stringify(guard.attemptId)}` },
  };
}

/** Returns false when the guard no longer matched (result discarded). */
export async function storeCheckoutDiffError(
  checkoutId: string,
  err: unknown,
  guard?: CheckoutDiffWriteGuard,
): Promise<boolean> {
  const message =
    err instanceof Error ? err.message : "Diff-beräkning misslyckades av okänd anledning";

  const result = await prisma.mapCheckout.updateMany({
    where: guardWhere(checkoutId, guard),
    data: {
      diffSummaryJson: JSON.stringify({
        _status: "error",
        error: message,
        failedAt: new Date().toISOString(),
        ...(guard ? { checkinStoragePath: guard.checkinStoragePath } : {}),
      } satisfies DiffMetaError),
    },
  });
  return result.count > 0;
}

export type DiffClaimDecision =
  | { action: "skip"; reason: "done" | "lease_active" }
  | { action: "stale" }
  | { action: "claim"; startedAt: string; attempts: number };

/**
 * Pure state machine for a pending diff. Timeout is measured from the latest attempt,
 * so a diff that was queued but never started is claimed instead of failing.
 */
export function decideCheckoutDiffClaim(
  raw: string | null | undefined,
  now: number = Date.now(),
  checkinStoragePath?: string | null,
): DiffClaimDecision {
  const meta = parseDiffMeta(raw);
  const nowIso = new Date(now).toISOString();
  const belongsToOtherCheckin = (path: string | null | undefined) =>
    Boolean(checkinStoragePath && path && path !== checkinStoragePath);

  if (meta.kind === "ready") {
    return belongsToOtherCheckin(meta.summary.checkinStoragePath)
      ? { action: "claim", startedAt: nowIso, attempts: 1 }
      : { action: "skip", reason: "done" };
  }
  if (meta.kind === "error") return { action: "skip", reason: "done" };
  if (meta.kind === "empty" || belongsToOtherCheckin(meta.checkinStoragePath)) {
    return { action: "claim", startedAt: nowIso, attempts: 1 };
  }

  const startedAt = meta.startedAt ?? nowIso;
  if (!meta.attemptStartedAt) {
    return { action: "claim", startedAt, attempts: meta.attempts + 1 };
  }

  const attemptAge = now - Date.parse(meta.attemptStartedAt);
  if (!Number.isNaN(attemptAge) && attemptAge < CHECKOUT_DIFF_LEASE_MS) {
    return { action: "skip", reason: "lease_active" };
  }
  if (meta.attempts >= CHECKOUT_DIFF_MAX_ATTEMPTS) return { action: "stale" };
  return { action: "claim", startedAt, attempts: meta.attempts + 1 };
}

export function isCheckoutDiffStale(
  raw: string | null | undefined,
  now: number = Date.now(),
  checkinStoragePath?: string | null,
): boolean {
  return decideCheckoutDiffClaim(raw, now, checkinStoragePath).action === "stale";
}

/**
 * Runs the subset diff under a lease. Called inline from POST /diff.
 * The claim is a compare-and-swap on the stored JSON, so concurrent calls cannot both
 * win; results are only written while checkin path and attemptId still match.
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

  const checkinStoragePath = checkout.checkinStoragePath;
  const decision = decideCheckoutDiffClaim(
    checkout.diffSummaryJson,
    Date.now(),
    checkinStoragePath,
  );
  if (decision.action === "skip") return;

  if (decision.action === "stale") {
    await prisma.mapCheckout.updateMany({
      where: {
        id: checkoutId,
        checkinStoragePath,
        diffSummaryJson: checkout.diffSummaryJson,
      },
      data: {
        diffSummaryJson: JSON.stringify({
          _status: "error",
          error: CHECKOUT_DIFF_STALE_MESSAGE,
          failedAt: new Date().toISOString(),
          checkinStoragePath,
        } satisfies DiffMetaError),
      },
    });
    return;
  }

  const attemptId = randomUUID();
  const claimed = await prisma.mapCheckout.updateMany({
    where: {
      id: checkoutId,
      status: { in: CHECKOUT_DIFF_STATUSES },
      checkinStoragePath,
      diffSummaryJson: checkout.diffSummaryJson,
    },
    data: {
      diffSummaryJson: JSON.stringify({
        _status: "pending",
        startedAt: decision.startedAt,
        checkinStoragePath,
        attemptId,
        attemptStartedAt: new Date().toISOString(),
        attempts: decision.attempts,
      } satisfies DiffMetaPending),
    },
  });
  if (claimed.count === 0) return;

  const guard: CheckoutDiffWriteGuard = { checkinStoragePath, attemptId };
  try {
    const diff = await computeCheckoutSubsetDiff(checkoutId);
    if (diff.checkinStoragePath && diff.checkinStoragePath !== checkinStoragePath) {
      console.warn("[checkout-diff] checkin replaced during computation; discarding", {
        checkoutId,
      });
      return;
    }
    const stored = await storeCheckoutDiffSummary(checkoutId, diff, guard);
    if (!stored) {
      console.warn("[checkout-diff] attempt superseded; result discarded", { checkoutId });
    }
  } catch (err) {
    console.error("Checkout subset diff failed:", err);
    await storeCheckoutDiffError(checkoutId, err, guard);
  }
}

/**
 * @deprecated Använd POST /diff inline i stället. after() dör ofta tyst på Vercel
 * och kunde stjäla lease utan att bli klar.
 */
export function scheduleCheckoutSubsetDiff(checkoutId: string): void {
  void checkoutId;
}
