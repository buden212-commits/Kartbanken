import { runAfterResponse } from "@/lib/background";
import { prisma } from "@/lib/prisma";
import {
  computeCheckoutSubsetDiff,
  storeCheckoutDiffSummary,
} from "./subset-diff";
import { CheckoutStatus } from "./types";
import { parseSelectionJson } from "./types";

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

type DiffMetaPending = { _status: "pending"; startedAt: string };
type DiffMetaError = { _status: "error"; error: string; failedAt: string };

export type ParsedCheckoutDiff =
  | { status: "not_applicable" }
  | { status: "pending"; startedAt: string | null; objectCount: number }
  | { status: "error"; error: string; failedAt: string | null; objectCount: number }
  | { status: "ready"; summary: CheckoutDiffSummary; objectCount: number };

function parseDiffMeta(raw: string | null | undefined):
  | { kind: "pending"; startedAt: string | null }
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
    return { kind: "pending", startedAt: meta.startedAt ?? null };
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

export function parseCheckoutDiffFromRecord(checkout: {
  status: string;
  checkinStoragePath: string | null;
  diffSummaryJson: string | null;
  selectionJson: string;
}): ParsedCheckoutDiff {
  const objectCount = parseSelectionJson(checkout.selectionJson).objectIds.length;

  if (checkout.status !== CheckoutStatus.CHECKED_IN || !checkout.checkinStoragePath) {
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

const STUCK_DIFF_MS = 10 * 60 * 1000;

export function shouldRetryCheckoutDiff(parsed: ParsedCheckoutDiff): boolean {
  if (parsed.status !== "pending") return false;
  if (!parsed.startedAt) return true;
  const started = Date.parse(parsed.startedAt);
  if (Number.isNaN(started)) return true;
  return Date.now() - started > STUCK_DIFF_MS;
}

export function scheduleCheckoutSubsetDiff(checkoutId: string): void {
  runAfterResponse(async () => {
    try {
      const diff = await computeCheckoutSubsetDiff(checkoutId);
      await storeCheckoutDiffSummary(checkoutId, diff);
    } catch (err) {
      console.error("Checkout subset diff failed:", err);
      await storeCheckoutDiffError(checkoutId, err);
    }
  });
}
