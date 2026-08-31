"use client";

import type { CompareProcessingProgress } from "@/lib/compare/processing-progress";
import { compareProcessingStageMessage } from "@/lib/compare/processing-progress";

const SLOW_PROCESSING_MS = 3 * 60 * 1000;
const STUCK_PROCESSING_MS = 8 * 60 * 1000;

function formatElapsedMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (mins === 0) return `${secs} s`;
  return `${mins} min ${secs} s`;
}

type Props = {
  title: string;
  progress?: CompareProcessingProgress | null;
  elapsedMs: number;
  onRetry?: () => void;
};

export function CompareProcessingPanel({ title, progress, elapsedMs, onRetry }: Props) {
  const stageMessage = progress ? compareProcessingStageMessage(progress) : null;
  const tileProgress = progress?.stage === "tiles" ? progress.tileProgress : null;
  const isSlowProcessing = elapsedMs >= SLOW_PROCESSING_MS;
  const isStuckProcessing = elapsedMs >= STUCK_PROCESSING_MS;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-8">
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 text-center">
        <div
          className="h-10 w-10 shrink-0 animate-spin rounded-full border-[3px] border-amber-300 border-t-amber-700"
          aria-hidden
        />

        <div>
          <p className="font-medium text-amber-800">{title}</p>
          {stageMessage && <p className="mt-2 text-sm font-medium text-amber-900">{stageMessage}</p>}
          <p className="mt-2 text-sm text-slate-600">
            Sidan uppdateras automatiskt när jämförelsen är klar.
          </p>
        </div>

        {tileProgress && !tileProgress.preparing && (
          <div className="w-full max-w-xs space-y-2">
            <p className="text-xs text-slate-500">
              {tileProgress.remaining} rutor kvar ({tileProgress.percent} %)
            </p>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-amber-100"
              role="progressbar"
              aria-valuenow={tileProgress.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Skapar kartlager"
            >
              <div
                className="h-full rounded-full bg-amber-600 transition-[width] duration-300"
                style={{ width: `${tileProgress.percent}%` }}
              />
            </div>
          </div>
        )}

        {tileProgress?.preparing && (
          <p className="text-xs text-slate-500">Räknaren visas när systemet vet hur många rutor som ska skapas.</p>
        )}

        <p className="text-xs text-slate-500">Förfluten tid: {formatElapsedMs(elapsedMs)}</p>

        {isSlowProcessing && !isStuckProcessing && (
          <p className="text-sm text-amber-900">
            Det tar längre tid än vanligt. Stora kartfiler kan behöva några minuter — vi försöker igen
            automatiskt.
          </p>
        )}

        {isStuckProcessing && onRetry && (
          <div className="space-y-3">
            <p className="text-sm text-amber-900">
              Jämförelsen verkar ha fastnat. Prova att uppdatera — vi triggar om bearbetningen vid
              varje försök.
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="rounded-lg border border-amber-300 px-4 py-2 text-sm text-amber-900 transition hover:bg-amber-100"
            >
              Uppdatera / försök igen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
