"use client";

import type { CompareProcessingProgress } from "@/lib/compare/processing-progress";
import { compareProcessingStageMessage } from "@/lib/compare/processing-progress";

const SLOW_PROCESSING_MS = 2 * 60 * 1000;
const STUCK_PROCESSING_MS = 8 * 60 * 1000;

const STAGE_ORDER = [
  { key: "parse", label: "Läser kartfiler" },
  { key: "diff", label: "Beräknar skillnader" },
  { key: "layers", label: "Skapar kartlager" },
] as const;

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
  const activeStageIndex = progress
    ? STAGE_ORDER.findIndex((stage) => stage.key === progress.stage)
    : -1;
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

        {activeStageIndex >= 0 && (
          <ol className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs">
            {STAGE_ORDER.map((stage, index) => {
              const done = index < activeStageIndex;
              const active = index === activeStageIndex;
              return (
                <li
                  key={stage.key}
                  className={
                    active
                      ? "font-medium text-amber-900"
                      : done
                        ? "text-amber-700"
                        : "text-slate-400"
                  }
                >
                  {done ? "✓ " : ""}
                  {index + 1}. {stage.label}
                </li>
              );
            })}
          </ol>
        )}

        <p className="text-xs text-slate-500">Förfluten tid: {formatElapsedMs(elapsedMs)}</p>

        {isSlowProcessing && !isStuckProcessing && (
          <p className="text-sm text-amber-900">
            Stora kartfiler kan behöva några minuter första gången. Resultatet sparas sedan, så
            nästa gång går det direkt.
          </p>
        )}

        {isStuckProcessing && onRetry && (
          <div className="space-y-3">
            <p className="text-sm text-amber-900">
              Jämförelsen verkar ha fastnat. Prova att starta om den — beräkningen börjar då om från
              början.
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
