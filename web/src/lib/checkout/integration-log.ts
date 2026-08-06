import type { OcadObjectChange } from "@/lib/ocad/diff-types";

export type IntegrationLogContext = {
  checkoutId: string;
  mapFileId?: string;
  headVersionId?: string;
  headVersionNumber?: number;
  checkinPath?: string;
};

export type IntegrationStep =
  | "start"
  | "resolve_diff"
  | "load_files"
  | "apply_changes"
  | "validate_output"
  | "upload"
  | "persist"
  | "post_process";

function summarizeChanges(changes: OcadObjectChange[] | undefined): {
  added: number;
  removed: number;
  modified: number;
  bySymbol: Array<{ symbolName: string; symbolNumber: number; count: number }>;
} {
  if (!changes?.length) {
    return { added: 0, removed: 0, modified: 0, bySymbol: [] };
  }

  const bySymbolMap = new Map<string, { symbolName: string; symbolNumber: number; count: number }>();
  let added = 0;
  let removed = 0;
  let modified = 0;

  for (const change of changes) {
    if (change.changeType === "added") added++;
    else if (change.changeType === "removed") removed++;
    else modified++;

    const key = `${change.symbolNumber}\t${change.symbolName}`;
    const current = bySymbolMap.get(key) ?? {
      symbolNumber: change.symbolNumber,
      symbolName: change.symbolName,
      count: 0,
    };
    current.count++;
    bySymbolMap.set(key, current);
  }

  const bySymbol = [...bySymbolMap.values()].sort((a, b) => b.count - a.count);
  return { added, removed, modified, bySymbol };
}

export function logIntegrationStep(
  step: IntegrationStep,
  ctx: IntegrationLogContext,
  detail?: Record<string, unknown>,
): void {
  console.info("[checkout-integration]", {
    step,
    checkoutId: ctx.checkoutId,
    mapFileId: ctx.mapFileId,
    headVersionId: ctx.headVersionId,
    headVersionNumber: ctx.headVersionNumber,
    ...detail,
  });
}

export function logIntegrationChanges(
  ctx: IntegrationLogContext,
  changes: OcadObjectChange[] | undefined,
  extra?: Record<string, unknown>,
): void {
  const summary = summarizeChanges(changes);
  console.info("[checkout-integration]", {
    step: "diff_summary",
    checkoutId: ctx.checkoutId,
    mapFileId: ctx.mapFileId,
    ...summary,
    topSymbols: summary.bySymbol.slice(0, 8),
    ...extra,
  });
}

export function logIntegrationError(
  step: IntegrationStep,
  ctx: IntegrationLogContext,
  err: unknown,
  detail?: Record<string, unknown>,
): void {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;

  console.error("[checkout-integration]", {
    step,
    checkoutId: ctx.checkoutId,
    mapFileId: ctx.mapFileId,
    headVersionId: ctx.headVersionId,
    headVersionNumber: ctx.headVersionNumber,
    error: message,
    stack,
    ...detail,
  });
}

export function integrationErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }
  return fallback;
}
