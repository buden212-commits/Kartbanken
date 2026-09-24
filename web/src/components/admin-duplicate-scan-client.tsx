"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { DuplicateScanMapOption, DuplicateScanResult } from "@/lib/admin/duplicate-scan";
import { formatOcadSymbolNumber } from "@/lib/ocad/layers";
import { objectTypeLabel } from "@/lib/checkout/integration-warnings";
import { MapName } from "@/components/map-name";
import { formatBytes } from "@/lib/format";
import { readApiError } from "@/lib/api/read-api-error";

type Props = {
  maps: DuplicateScanMapOption[];
};

function formatIndices(indices: number[], max = 12): string {
  if (indices.length <= max) return indices.join(", ");
  return `${indices.slice(0, max).join(", ")} … (+${indices.length - max})`;
}

export function AdminDuplicateScanClient({ maps }: Props) {
  const [mapId, setMapId] = useState(maps[0]?.id ?? "");
  const selectedMap = useMemo(
    () => maps.find((map) => map.id === mapId) ?? null,
    [maps, mapId],
  );
  const [versionId, setVersionId] = useState(selectedMap?.versions[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DuplicateScanResult | null>(null);

  function handleMapChange(nextMapId: string) {
    setMapId(nextMapId);
    const next = maps.find((map) => map.id === nextMapId);
    setVersionId(next?.versions[0]?.id ?? "");
    setResult(null);
    setError(null);
  }

  async function handleScan() {
    if (!versionId) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/duplicates/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId }),
      });
      if (!res.ok) {
        const { message } = await readApiError(res, "Skanning misslyckades");
        setError(message);
        return;
      }
      const data = (await res.json()) as DuplicateScanResult;
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Skanning misslyckades");
    } finally {
      setLoading(false);
    }
  }

  if (maps.length === 0) {
    return (
      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
        Inga kartor med versioner att skanna.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <section className="card space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Välj karta och version</h2>
          <p className="mt-1 text-sm text-slate-600">
            Skannar efter objekt med identisk symbol, geometri och text (exakta dubbletter). Stora
            kartor kan ta någon minut.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="dup-map" className="mb-1 block text-xs font-medium text-slate-500">
              Område
            </label>
            <select
              id="dup-map"
              value={mapId}
              onChange={(event) => handleMapChange(event.target.value)}
              className="form-select w-full"
              disabled={loading}
            >
              {maps.map((map) => (
                <option key={map.id} value={map.id}>
                  {map.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="dup-version" className="mb-1 block text-xs font-medium text-slate-500">
              Version
            </label>
            <select
              id="dup-version"
              value={versionId}
              onChange={(event) => {
                setVersionId(event.target.value);
                setResult(null);
                setError(null);
              }}
              className="form-select w-full"
              disabled={loading || !selectedMap}
            >
              {(selectedMap?.versions ?? []).map((version) => (
                <option key={version.id} value={version.id}>
                  v{version.versionNumber}
                  {version.isPublished ? " (publicerad)" : ""}
                  {version.objectCount != null ? ` · ${version.objectCount} objekt` : ""}
                  {` · ${formatBytes(version.fileSizeBytes)}`}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="button"
          disabled={loading || !versionId}
          onClick={() => void handleScan()}
          className="inline-flex items-center rounded-lg bg-ifk-blue px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "Skannar…" : "Skanna efter dubbletter"}
        </button>
      </section>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      {result && (
        <section className="card space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Resultat</h2>
              <p className="mt-1 text-sm text-slate-600">
                <MapName title={result.map.title} areaType={result.map.areaType} /> · v
                {result.version.versionNumber}
                {result.version.isPublished ? " (publicerad)" : ""} · {result.objectCount} objekt ·{" "}
                {(result.scanDurationMs / 1000).toFixed(1)} s
              </p>
            </div>
            <Link
              href={`/maps/${result.map.slug}`}
              className="text-sm text-ifk-blue hover:underline"
            >
              Öppna område
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-center text-sm">
              <p className="text-xs text-slate-500">Dubblettgrupper</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">
                {result.duplicateGroupCount}
              </p>
            </div>
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-center text-sm text-amber-950">
              <p className="text-xs text-amber-800">Extra objekt</p>
              <p className="mt-1 text-xl font-semibold">{result.extraDuplicateCount}</p>
            </div>
            <div className="col-span-2 rounded-lg bg-slate-50 px-3 py-2 text-center text-sm sm:col-span-1">
              <p className="text-xs text-slate-500">Fil</p>
              <p className="mt-1 truncate text-sm font-medium text-slate-800">
                {result.version.originalFilename}
              </p>
            </div>
          </div>

          {result.duplicateGroupCount === 0 ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              Inga exakta dubbletter hittades.
            </p>
          ) : (
            <>
              {result.groupsTruncated && (
                <p className="text-sm text-amber-800">
                  Visar de {result.groups.length} största grupperna av totalt{" "}
                  {result.duplicateGroupCount}.
                </p>
              )}
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                      <th className="px-3 py-2 font-medium">Symbol</th>
                      <th className="px-3 py-2 font-medium">Typ</th>
                      <th className="px-3 py-2 font-medium">Antal</th>
                      <th className="px-3 py-2 font-medium">Läge</th>
                      <th className="px-3 py-2 font-medium">Objektindex</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.groups.map((group) => (
                      <tr key={group.key} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-2 text-slate-900">
                          <span className="font-medium">
                            {formatOcadSymbolNumber(group.symbolNumber)}
                          </span>{" "}
                          {group.symbolName}
                          {group.text ? (
                            <span className="mt-0.5 block text-xs text-slate-500">
                              text «{group.text}»
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-slate-600">{objectTypeLabel(group.type)}</td>
                        <td className="px-3 py-2 tabular-nums text-slate-900">×{group.count}</td>
                        <td className="px-3 py-2 font-mono text-xs text-slate-600">
                          ({Math.round(group.centroid[0])}, {Math.round(group.centroid[1])})
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-slate-600">
                          {formatIndices(group.objectIndices)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-500">
                Exakt dubblett = samma symbolnummer, samma geometrihash och samma text. Ta bort
                överflödiga kopior i OCAD Desktop och ladda upp en ny version.
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );
}
