"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DiffViewClient, type DiffSummary, type LayerPaths } from "@/components/diff-view-client";
import type { OcadObjectChange } from "@/lib/ocad/diff-types";

type CompareResponse =
  | {
      status: "processing";
      versionA: { id: string; versionNumber: number };
      versionB: { id: string; versionNumber: number };
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

export function ComparePageClient({ mapSlug, mapTitle, v1, v2 }: Props) {
  const router = useRouter();
  const [data, setData] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <Link href={`/maps/${mapSlug}`} className="link-muted text-sm">
        ← {mapTitle}
      </Link>

      <h1 className="mt-4 text-3xl font-semibold text-slate-900">Jämför versioner</h1>
      <p className="mt-2 text-slate-600">
        Granskar skillnader mellan två uppladdade versioner.
      </p>

      {loading && !data && (
        <div className="card mt-10 text-center">
          <p className="text-slate-700">Laddar jämförelse…</p>
          <p className="mt-2 text-sm text-slate-500">
            Stora kartfiler kan ta upp till en minut att parsa.
          </p>
        </div>
      )}

      {data?.status === "processing" && (
        <div className="mt-10 rounded-xl border border-amber-200 bg-amber-50 p-8 text-center">
          <p className="font-medium text-amber-800">
            Jämför v{data.versionA.versionNumber} → v{data.versionB.versionNumber}…
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Parsar OCAD-filer, beräknar diff och skapar kartlager. Sidan uppdateras automatiskt.
          </p>
        </div>
      )}

      {data?.status === "error" && (
        <div className="mt-10 rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">
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

      {data?.status === "ok" && (
        <div className="mt-10">
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
