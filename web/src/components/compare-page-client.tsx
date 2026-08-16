"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DiffViewClient, type DiffSummary, type LayerPaths } from "@/components/diff-view-client";
import type { OcadObjectChange } from "@/lib/ocad/diff-types";
import type { VersionDiffProgress } from "@/lib/ocad/version-diff-progress";

type CompareResponse =
  | {
      status: "processing";
      versionA: { id: string; versionNumber: number };
      versionB: { id: string; versionNumber: number };
      progress?: VersionDiffProgress | null;
      stale?: boolean;
      canRetry?: boolean;
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
};

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

export function ComparePageClient({ mapSlug, mapTitle, v1, v2 }: Props) {
  const router = useRouter();
  const [data, setData] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [retrying, setRetrying] = useState(false);

  const fetchCompare = useCallback(async () => {
    const res = await fetch(`/api/maps/${mapSlug}/compare?v1=${v1}&v2=${v2}`);
    const json = (await res.json()) as CompareResponse;
    setData(json);
    setLoading(false);
  }, [mapSlug, v1, v2]);

  useEffect(() => {
    void fetchCompare();
  }, [fetchCompare]);

  useEffect(() => {
    if (data?.status !== "processing") return;
    const timer = setInterval(() => {
      void fetchCompare();
    }, 3000);
    return () => clearInterval(timer);
  }, [data?.status, fetchCompare]);

  useEffect(() => {
    const busy = loading || data?.status === "processing";
    if (!busy) {
      setElapsedSec(0);
      return;
    }
    const started = Date.now();
    setElapsedSec(0);
    const timer = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [loading, data?.status]);

  async function retryCompare() {
    setRetrying(true);
    setLoading(true);
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

  const progress = data && "progress" in data ? data.progress : null;
  const canRetry =
    (data?.status === "processing" && (data.stale || data.canRetry || elapsedSec >= 8 * 60)) ||
    (data?.status === "error" && data.canRetry !== false);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <Link href={`/maps/${mapSlug}`} className="link-muted text-sm">
        ← {mapTitle}
      </Link>

      <h1 className="mt-4 text-2xl font-semibold text-slate-900 sm:text-3xl">Jämför versioner</h1>
      <p className="mt-2 text-slate-600">
        Granskar skillnader mellan två uppladdade versioner.
      </p>

      {loading && !data && (
        <div className="card mt-10 text-center">
          <WorkingSpinner className="border-slate-300 border-t-ifk-blue" />
          <p className="mt-4 text-slate-700">Laddar jämförelse…</p>
          <p className="mt-2 text-sm text-slate-500">
            Stora kartfiler kan ta upp till en minut att parsa.
          </p>
          {elapsedSec > 0 && (
            <p className="mt-2 text-xs text-slate-500">Förfluten tid: {formatElapsed(elapsedSec)}</p>
          )}
        </div>
      )}

      {data?.status === "processing" && (
        <div className="mt-10 rounded-xl border border-amber-200 bg-amber-50 p-8 text-center">
          <WorkingSpinner />
          <p className="mt-4 font-medium text-amber-800">
            Jämför v{data.versionA.versionNumber} → v{data.versionB.versionNumber}…
          </p>
          {progress ? (
            <div className="mx-auto mt-3 max-w-md rounded-lg border border-amber-200/80 bg-white/70 px-3 py-2 text-left text-sm text-slate-700">
              <p>
                <span className="font-medium text-amber-900">Steg:</span> {progress.label}
              </p>
              {progress.detail && <p className="mt-1 text-slate-600">{progress.detail}</p>}
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-600">
              Parsar OCAD-filer, beräknar diff och skapar kartlager. Sidan uppdateras automatiskt.
            </p>
          )}
          <p className="mt-3 text-xs text-amber-900/80">
            Förfluten tid: {formatElapsed(elapsedSec)}
            {elapsedSec >= 60
              ? " — stora kartor (t.ex. Mora Väst) kan ta flera minuter."
              : ""}
          </p>
          {(data.stale || elapsedSec >= 8 * 60) && (
            <p className="mt-3 text-sm text-amber-950">
              Det verkar ha fastnat. Starta om jämförelsen — endast ett jobb körs åt gången.
            </p>
          )}
          {canRetry && (
            <button
              type="button"
              disabled={retrying}
              onClick={() => void retryCompare()}
              className="mt-4 rounded-lg border border-amber-400 bg-white px-4 py-2 text-sm font-medium text-amber-950 hover:bg-amber-100 disabled:opacity-50"
            >
              {retrying ? "Startar om…" : "Starta om jämförelse"}
            </button>
          )}
        </div>
      )}

      {data?.status === "error" && (
        <div className="mt-10 rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">
          <p className="font-medium">Jämförelsen misslyckades</p>
          <p className="mt-2 whitespace-pre-wrap text-sm">{data.error}</p>
          {progress?.label && (
            <p className="mt-2 text-sm text-red-700">Senaste steg: {progress.label}</p>
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

      {data?.status === "ok" && (
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
