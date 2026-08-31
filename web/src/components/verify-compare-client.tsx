"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CompareProcessingPanel } from "@/components/compare-processing-panel";
import { DiffViewClient, type DiffSummary, type LayerPaths } from "@/components/diff-view-client";
import { VerifyCompareForm } from "@/components/verify-compare-form";
import type { OcadObjectChange } from "@/lib/ocad/diff-types";

type VerifyCompareResponse =
  | {
      status: "processing";
      fileNameA: string;
      fileNameB: string;
    }
  | { status: "error"; error: string }
  | {
      status: "ok";
      fileNameA: string;
      fileNameB: string;
      summary: DiffSummary;
      changes: OcadObjectChange[];
      layerPaths: LayerPaths | null;
    };

export function VerifyCompareClient() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [data, setData] = useState<VerifyCompareResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [processingStartedAt, setProcessingStartedAt] = useState<number | null>(null);
  const [processingElapsedMs, setProcessingElapsedMs] = useState(0);
  const processingStartedAtRef = useRef<number | null>(null);

  const fetchCompare = useCallback(async () => {
    if (!jobId) return;
    const res = await fetch(`/api/verify/compare/${jobId}`);
    const json = (await res.json()) as VerifyCompareResponse;
    setData(json);
    setLoading(false);
    if (json.status !== "processing") {
      processingStartedAtRef.current = null;
      setProcessingStartedAt(null);
      setProcessingElapsedMs(0);
    }
  }, [jobId]);

  useEffect(() => {
    if (!jobId) return;
    setLoading(true);
    processingStartedAtRef.current = Date.now();
    setProcessingStartedAt(Date.now());
    setProcessingElapsedMs(0);
    void fetchCompare();
  }, [jobId, fetchCompare]);

  useEffect(() => {
    if (data?.status !== "processing") return;
    const timer = setInterval(() => {
      void fetchCompare();
    }, 3000);
    return () => clearInterval(timer);
  }, [data?.status, fetchCompare]);

  useEffect(() => {
    if (data?.status !== "processing" || processingStartedAt === null) return;
    const timer = setInterval(() => {
      setProcessingElapsedMs(Date.now() - processingStartedAt);
    }, 1000);
    return () => clearInterval(timer);
  }, [data?.status, processingStartedAt]);

  const previewUrls = useMemo(() => {
    if (!jobId) return undefined;
    return {
      full: `/api/verify/compare/${jobId}/preview`,
      added: `/api/verify/compare/${jobId}/layer?layer=added`,
      removed: `/api/verify/compare/${jobId}/layer?layer=removed`,
      modified: `/api/verify/compare/${jobId}/layer?layer=modified`,
    };
  }, [jobId]);

  function handleNewCompare() {
    setJobId(null);
    setData(null);
    setLoading(false);
    processingStartedAtRef.current = null;
    setProcessingStartedAt(null);
    setProcessingElapsedMs(0);
  }

  if (!jobId) {
    return <VerifyCompareForm onJobCreated={setJobId} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Tillfällig jämförelse — filerna sparas inte som kartversion.
        </p>
        <button
          type="button"
          onClick={handleNewCompare}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:border-ifk-blue hover:text-ifk-blue"
        >
          Ny jämförelse
        </button>
      </div>

      {loading && !data && (
        <div className="card text-center">
          <p className="text-slate-700">Laddar jämförelse…</p>
          <p className="mt-2 text-sm text-slate-500">
            Stora kartfiler kan ta upp till en minut att parsa.
          </p>
        </div>
      )}

      {data?.status === "processing" && (
        <CompareProcessingPanel
          title={`Jämför ${data.fileNameA} → ${data.fileNameB}…`}
          elapsedMs={processingElapsedMs}
          onRetry={() => {
            setLoading(true);
            void fetchCompare();
          }}
        />
      )}

      {data?.status === "error" && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">
          <p>{data.error}</p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void fetchCompare();
            }}
            className="mt-4 rounded-lg border border-red-300 px-4 py-2 text-sm transition hover:bg-red-100"
          >
            Försök igen
          </button>
        </div>
      )}

      {data?.status === "ok" && previewUrls && (
        <DiffViewClient
          diff={data.summary}
          changes={data.changes}
          versionALabel="Fil A (äldre)"
          versionBLabel="Fil B (nyare)"
          previewUrls={previewUrls}
          layerPaths={data.layerPaths}
          exportEnabled={false}
        />
      )}
    </div>
  );
}
