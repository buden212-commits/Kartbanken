"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CompareProcessingPanel } from "@/components/compare-processing-panel";
import { DiffViewClient, type DiffSummary, type LayerPaths } from "@/components/diff-view-client";
import type { CompareProcessingProgress } from "@/lib/compare/processing-progress";
import type { OcadObjectChange } from "@/lib/ocad/diff-types";

type CompareResponse =
  | {
      status: "processing";
      versionA: { id: string; versionNumber: number };
      versionB: { id: string; versionNumber: number };
      progress: CompareProcessingProgress | null;
      workerActive: boolean;
    }
  | { status: "error"; error: string }
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

const POLL_INTERVAL_MS = 2500;

export function ComparePageClient({ mapSlug, mapTitle, v1, v2 }: Props) {
  const router = useRouter();
  const [data, setData] = useState<CompareResponse | null>(null);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [elapsedMs, setElapsedMs] = useState(0);
  const workRequestRef = useRef<Promise<void> | null>(null);

  const isDone = data?.status === "ok" || data?.status === "error";

  const pollStatus = useCallback(async () => {
    const res = await fetch(`/api/maps/${mapSlug}/compare?v1=${v1}&v2=${v2}`);
    const json = (await res.json()) as CompareResponse;
    setData((current) => {
      // Ett klart resultat får inte skrivas över av ett fördröjt statussvar.
      if (current?.status === "ok" && json.status === "processing") return current;
      return json;
    });
    return json;
  }, [mapSlug, v1, v2]);

  /**
   * Beräkningen körs i detta anrop och kan ta flera minuter. Den startas en gång
   * per sidladdning medan statuspollningen håller vyn uppdaterad under tiden.
   */
  const runCompare = useCallback(
    (force: boolean) => {
      if (workRequestRef.current) return workRequestRef.current;

      const request = (async () => {
        try {
          const res = await fetch(`/api/maps/${mapSlug}/compare`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ v1, v2, force }),
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            setData({
              status: "error",
              error: body.error ?? "Jämförelsen kunde inte slutföras. Försök igen.",
            });
            return;
          }
          const json = (await res.json()) as CompareResponse;
          if (json.status === "processing") {
            await pollStatus();
          } else {
            setData(json);
          }
        } catch {
          setData({
            status: "error",
            error:
              "Jämförelsen avbröts innan den blev klar. Kartfilerna kan vara mycket stora — försök igen.",
          });
        } finally {
          workRequestRef.current = null;
        }
      })();

      workRequestRef.current = request;
      return request;
    },
    [mapSlug, v1, v2, pollStatus],
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const res = await fetch(`/api/maps/${mapSlug}/compare?v1=${v1}&v2=${v2}`);
      const json = (await res.json()) as CompareResponse;
      if (cancelled) return;
      setData(json);
      // Kartlagren kan saknas om en tidigare körning avbröts efter att diffen sparats.
      if (json.status === "processing" || (json.status === "ok" && !json.layerPaths)) {
        void runCompare(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mapSlug, v1, v2, runCompare]);

  useEffect(() => {
    if (isDone) return;
    const timer = setInterval(() => {
      void (async () => {
        const json = await pollStatus();
        // Plattformen kan avbryta ett långt anrop; ta då över beräkningen igen.
        if (json.status === "processing" && !json.workerActive) {
          void runCompare(false);
        }
      })();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isDone, pollStatus, runCompare]);

  useEffect(() => {
    if (isDone) return;
    const timer = setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 1000);
    return () => clearInterval(timer);
  }, [isDone, startedAt]);

  const retry = useCallback(() => {
    setData(null);
    setStartedAt(Date.now());
    setElapsedMs(0);
    void runCompare(true);
  }, [runCompare]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <Link href={`/maps/${mapSlug}`} className="link-muted text-sm">
        ← {mapTitle}
      </Link>

      <h1 className="mt-4 text-2xl font-semibold text-slate-900 sm:text-3xl">Jämför versioner</h1>
      <p className="mt-2 text-slate-600">
        Granskar skillnader mellan två uppladdade versioner.
      </p>

      {!isDone && (
        <div className="mt-10">
          <CompareProcessingPanel
            title={
              data?.status === "processing"
                ? `Jämför v${data.versionA.versionNumber} → v${data.versionB.versionNumber}…`
                : "Förbereder jämförelse…"
            }
            progress={data?.status === "processing" ? data.progress : null}
            elapsedMs={elapsedMs}
            onRetry={retry}
          />
        </div>
      )}

      {data?.status === "error" && (
        <div className="mt-10 rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">
          <p>{data.error}</p>
          <button
            type="button"
            onClick={retry}
            className="mt-4 rounded-lg border border-red-300 px-4 py-2 text-sm transition hover:bg-red-100"
          >
            Försök igen
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
