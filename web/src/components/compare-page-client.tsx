"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DiffViewClient, type DiffSummary, type LayerPaths } from "@/components/diff-view-client";
import type { OcadObjectChange } from "@/lib/ocad/diff-types";
import {
  VERSION_DIFF_STEPS,
  VERSION_DIFF_STALE_MS,
  isVersionDiffProgressStale,
  versionDiffStepIndex,
  versionDiffStepLabel,
  type VersionDiffProgress,
  type VersionDiffProgressStep,
} from "@/lib/ocad/version-diff-progress";

type CompareResponse =
  | {
      status: "processing";
      versionA: { id: string; versionNumber: number };
      versionB: { id: string; versionNumber: number };
      progress?: VersionDiffProgress | null;
      stale?: boolean;
      canRetry?: boolean;
      staleAfterMs?: number;
    }
  | {
      status: "error";
      error: string;
      progress?: VersionDiffProgress | null;
      canRetry?: boolean;
    }
  | {
      status: "ok";
      versionA: { id: string; versionNumber: number; fileName: string };
      versionB: { id: string; versionNumber: number; fileName: string };
      summary: DiffSummary;
      changes: OcadObjectChange[];
      layerPaths: LayerPaths | null;
    };

type Props = {
  mapSlug: string;
  mapTitle: string;
  v1: string;
  v2: string;
  versionANumber: number;
  versionBNumber: number;
};

const STEP_HINTS: Record<VersionDiffProgressStep, string> = {
  queued: "Jobbet väntar på att starta på servern.",
  parse_versions: "Kontrollerar att båda versionerna är parsade (utan att rita kartbild).",
  load_files: "Hämtar .ocd-filerna från lagringen (ska normalt ta sekunder).",
  parse_objects:
    "Hämtar filerna (sekunder) och parsar kartobjekt (ofta det längsta steget på stora kartor).",
  compute_diff: "Matchar objekt och räknar tillagda, borttagna och ändrade.",
  save: "Sparar resultatet så sidan kan visa diffen.",
  layers: "Skapar kartlager för tillagda/borttagna/ändrade objekt.",
};

const FETCH_TIMEOUT_MS = 25_000;

function WorkingSpinner({ className = "" }: { className?: string }) {
  return (
    <div
      className={`mx-auto h-9 w-9 animate-spin rounded-full border-2 border-amber-300 border-t-amber-700 ${className}`}
      role="status"
      aria-label="Arbetar"
    />
  );
}

function formatElapsed(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m <= 0) return `${s} s`;
  return `${m} min ${s.toString().padStart(2, "0")} s`;
}

function ProgressChecklist({ progress }: { progress: VersionDiffProgress | null | undefined }) {
  const activeIndex = progress ? versionDiffStepIndex(progress.step) : 1;
  return (
    <ol className="mt-4 space-y-1.5 text-left text-sm">
      {VERSION_DIFF_STEPS.map((step) => {
        const index = versionDiffStepIndex(step);
        const done = index < activeIndex;
        const active = index === activeIndex;
        return (
          <li
            key={step}
            className={`flex items-start gap-2 rounded-md px-2 py-1 ${
              active ? "bg-amber-100/80 text-amber-950" : done ? "text-slate-500" : "text-slate-400"
            }`}
          >
            <span className="mt-0.5 w-4 shrink-0 text-center text-xs font-semibold" aria-hidden>
              {done ? "✓" : active ? "●" : "○"}
            </span>
            <span>
              <span className={active ? "font-medium" : undefined}>{versionDiffStepLabel(step)}</span>
              {active && progress?.detail ? (
                <span className="mt-0.5 block text-xs text-amber-900/80">{progress.detail}</span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function initialProcessing(
  v1: string,
  v2: string,
  versionANumber: number,
  versionBNumber: number,
): CompareResponse {
  const startedAt = new Date().toISOString();
  return {
    status: "processing",
    versionA: { id: v1, versionNumber: versionANumber },
    versionB: { id: v2, versionNumber: versionBNumber },
    progress: {
      step: "queued",
      label: versionDiffStepLabel("queued"),
      detail: "Ansluter till servern och startar jämförelse…",
      updatedAt: startedAt,
      startedAt,
      stepIndex: 1,
      stepCount: VERSION_DIFF_STEPS.length,
    },
    stale: false,
    canRetry: false,
    staleAfterMs: VERSION_DIFF_STALE_MS,
  };
}

export function ComparePageClient({
  mapSlug,
  mapTitle,
  v1,
  v2,
  versionANumber,
  versionBNumber,
}: Props) {
  const router = useRouter();
  const [data, setData] = useState<CompareResponse>(() =>
    initialProcessing(v1, v2, versionANumber, versionBNumber),
  );
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [clientStartedMs] = useState(() => Date.now());
  const [retrying, setRetrying] = useState(false);
  const [fetchWarning, setFetchWarning] = useState<string | null>(null);

  const fetchCompare = useCallback(async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(`/api/maps/${mapSlug}/compare?v1=${v1}&v2=${v2}`, {
        signal: ctrl.signal,
        cache: "no-store",
      });
      const json = (await res.json()) as CompareResponse & { error?: string };
      if (!res.ok) {
        setData({
          status: "error",
          error: json.error ?? `Kunde inte hämta jämförelse (${res.status})`,
          canRetry: true,
        });
        setFetchWarning(null);
        return;
      }
      if (!json.status) {
        setFetchWarning("Oväntat svar från servern — försöker igen…");
        return;
      }
      setData(json);
      setFetchWarning(null);
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      setFetchWarning(
        aborted
          ? "Servern svarade inte i tid — visar senaste status och försöker igen…"
          : "Kunde inte nå servern — försöker igen…",
      );
    } finally {
      clearTimeout(timer);
    }
  }, [mapSlug, v1, v2]);

  useEffect(() => {
    void fetchCompare();
  }, [fetchCompare]);

  useEffect(() => {
    if (data.status !== "processing") return;
    const timer = setInterval(() => {
      void fetchCompare();
    }, 2500);
    return () => clearInterval(timer);
  }, [data.status, fetchCompare]);

  useEffect(() => {
    if (data.status !== "processing") return;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [data.status]);

  async function retryCompare() {
    setRetrying(true);
    setData(initialProcessing(v1, v2, versionANumber, versionBNumber));
    setFetchWarning(null);
    try {
      await fetch(`/api/maps/${mapSlug}/compare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ v1, v2, force: true }),
      });
      await fetchCompare();
    } finally {
      setRetrying(false);
    }
  }

  const progress = "progress" in data ? data.progress : null;
  const serverStartedMs = progress?.startedAt ? Date.parse(progress.startedAt) : NaN;
  const elapsedSec = Math.max(
    0,
    Math.floor(
      (nowMs - (Number.isFinite(serverStartedMs) ? serverStartedMs : clientStartedMs)) / 1000,
    ),
  );
  const updatedAtMs = progress?.updatedAt ? Date.parse(progress.updatedAt) : NaN;
  const sinceUpdateSec = Number.isFinite(updatedAtMs)
    ? Math.max(0, Math.floor((nowMs - updatedAtMs) / 1000))
    : null;
  const staleAfterMs =
    (data.status === "processing" && data.staleAfterMs) || VERSION_DIFF_STALE_MS;
  const looksStale =
    data.status === "processing" &&
    (data.stale ||
      isVersionDiffProgressStale(progress, "PROCESSING") ||
      (sinceUpdateSec !== null && sinceUpdateSec * 1000 >= staleAfterMs) ||
      elapsedSec * 1000 >= VERSION_DIFF_STALE_MS);

  const canRetry =
    (data.status === "processing" && (looksStale || data.canRetry || Boolean(fetchWarning))) ||
    (data.status === "error" && data.canRetry !== false);

  const stepHint = progress?.step ? STEP_HINTS[progress.step] : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <Link href={`/maps/${mapSlug}`} className="link-muted text-sm">
        ← {mapTitle}
      </Link>

      <h1 className="mt-4 text-2xl font-semibold text-slate-900 sm:text-3xl">Jämför versioner</h1>
      <p className="mt-2 text-slate-600">
        Granskar skillnader mellan två uppladdade versioner.
      </p>

      {data.status === "processing" && (
        <div className="mt-10 rounded-xl border border-amber-200 bg-amber-50 p-6 sm:p-8">
          <div className="text-center">
            <WorkingSpinner />
            <p className="mt-4 font-medium text-amber-800">
              Jämför v{data.versionA.versionNumber} → v{data.versionB.versionNumber}…
            </p>
            {progress?.stepIndex && progress.stepCount ? (
              <p className="mt-1 text-sm text-amber-900/80">
                Steg {progress.stepIndex} av {progress.stepCount}
                {progress.label ? `: ${progress.label}` : ""}
              </p>
            ) : progress?.label ? (
              <p className="mt-1 text-sm text-amber-900/80">{progress.label}</p>
            ) : null}
          </div>

          <div className="mx-auto mt-4 max-w-lg rounded-lg border border-amber-200/80 bg-white/80 px-3 py-3 text-slate-700">
            <ProgressChecklist progress={progress} />
            {stepHint && (
              <p className="mt-3 border-t border-amber-100 pt-3 text-xs text-slate-600">{stepHint}</p>
            )}
          </div>

          <div className="mx-auto mt-4 max-w-lg space-y-1 text-center text-xs text-amber-900/80">
            <p>
              Förfluten tid: {formatElapsed(elapsedSec)}
              {elapsedSec >= 60
                ? " — stora kartor (t.ex. Mora Väst) kan ta 5–15 minuter."
                : ""}
            </p>
            {sinceUpdateSec !== null && (
              <p>
                Senaste statusuppdatering:{" "}
                {sinceUpdateSec < 5 ? "nyss" : `för ${formatElapsed(sinceUpdateSec)} sedan`}
                {sinceUpdateSec < 45
                  ? " (servern arbetar fortfarande)"
                  : sinceUpdateSec < 90
                    ? " — om hämtning fastnat startas jobbet om automatiskt"
                    : " — parsning kan vara tyst en stund (CPU)"}
              </p>
            )}
            {fetchWarning && <p className="text-amber-950">{fetchWarning}</p>}
          </div>

          {looksStale && (
            <p className="mx-auto mt-4 max-w-lg text-center text-sm text-amber-950">
              Ingen ny status på ett tag. Jobbet kan ha avbrutits av tidsgräns eller minnesbrist.
              Starta om jämförelsen — endast ett jobb körs åt gången.
            </p>
          )}
          {canRetry && (
            <div className="mt-4 text-center">
              <button
                type="button"
                disabled={retrying}
                onClick={() => void retryCompare()}
                className="rounded-lg border border-amber-400 bg-white px-4 py-2 text-sm font-medium text-amber-950 hover:bg-amber-100 disabled:opacity-50"
              >
                {retrying ? "Startar om…" : "Starta om jämförelse"}
              </button>
            </div>
          )}
        </div>
      )}

      {data.status === "error" && (
        <div className="mt-10 rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">
          <p className="font-medium">Jämförelsen misslyckades</p>
          <p className="mt-2 whitespace-pre-wrap text-sm">{data.error}</p>
          {progress?.label && (
            <p className="mt-2 text-sm text-red-700">Senaste steg: {progress.label}</p>
          )}
          {progress?.detail && (
            <p className="mt-1 text-sm text-red-700/90">{progress.detail}</p>
          )}
          <button
            type="button"
            disabled={retrying}
            onClick={() => void retryCompare()}
            className="mt-4 rounded-lg border border-red-300 px-4 py-2 text-sm transition hover:bg-red-100 disabled:opacity-50"
          >
            {retrying ? "Startar om…" : "Försök igen"}
          </button>
        </div>
      )}

      {data.status === "ok" && (
        <div className="mt-10">
          <div className="mb-4 flex flex-wrap gap-2">
            <a
              href={`/api/maps/${mapSlug}/compare/export-pdf?v1=${v1}&v2=${v2}`}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Exportera PDF-rapport
            </a>
          </div>
          <DiffViewClient
            diff={data.summary}
            changes={data.changes}
            versionALabel={`v${data.versionA.versionNumber}`}
            versionBLabel={`v${data.versionB.versionNumber}`}
            mapSlug={mapSlug}
            versionAId={data.versionA.id}
            versionBId={data.versionB.id}
            layerPaths={data.layerPaths}
          />
        </div>
      )}

      <button
        type="button"
        onClick={() => router.push(`/maps/${mapSlug}`)}
        className="link-muted mt-10 text-sm"
      >
        Tillbaka till kartfilen
      </button>
    </div>
  );
}
