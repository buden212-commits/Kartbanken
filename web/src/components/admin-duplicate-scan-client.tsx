"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DuplicateScanMapOption, DuplicateScanResult } from "@/lib/admin/duplicate-scan";
import type { ExactDuplicateGroup } from "@/lib/ocad/exact-duplicates";
import type { OcadObjectChange } from "@/lib/ocad/diff-types";
import { formatOcadSymbolNumber } from "@/lib/ocad/layers";
import { objectTypeLabel } from "@/lib/checkout/integration-warnings";
import { MapName } from "@/components/map-name";
import { DiffMapPanel } from "@/components/diff-map-panel";
import { formatBytes } from "@/lib/format";
import { readApiError } from "@/lib/api/read-api-error";

type Props = {
  maps: DuplicateScanMapOption[];
};

const FOCUS_PAD_M = 25;

function formatIndices(indices: number[], max = 12): string {
  if (indices.length <= max) return indices.join(", ");
  return `${indices.slice(0, max).join(", ")} … (+${indices.length - max})`;
}

function groupBbox(group: ExactDuplicateGroup): [number, number, number, number] {
  const [cx, cy] = group.centroid;
  return [cx - FOCUS_PAD_M, cy - FOCUS_PAD_M, cx + FOCUS_PAD_M, cy + FOCUS_PAD_M];
}

function groupsToFitBbox(
  groups: ExactDuplicateGroup[],
): [number, number, number, number] | null {
  if (groups.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const group of groups) {
    const [cx, cy] = group.centroid;
    minX = Math.min(minX, cx);
    minY = Math.min(minY, cy);
    maxX = Math.max(maxX, cx);
    maxY = Math.max(maxY, cy);
  }
  const pad = Math.max(FOCUS_PAD_M * 2, (maxX - minX) * 0.08, (maxY - minY) * 0.08);
  return [minX - pad, minY - pad, maxX + pad, maxY + pad];
}

function groupToChange(group: ExactDuplicateGroup): OcadObjectChange {
  return {
    changeType: "modified",
    objectIndex: group.objectIndices[0] ?? -1,
    symbolNumber: group.symbolNumber,
    symbolName: group.symbolName,
    type: group.type,
    centroid: group.centroid,
    bbox: groupBbox(group),
    text: group.text,
    geometryHash: group.geometryHash,
  };
}

export function AdminDuplicateScanClient({ maps }: Props) {
  const router = useRouter();
  const [mapId, setMapId] = useState(maps[0]?.id ?? "");
  const selectedMap = useMemo(
    () => maps.find((map) => map.id === mapId) ?? null,
    [maps, mapId],
  );
  const [versionId, setVersionId] = useState(selectedMap?.versions[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState<"export-dup" | "export-unique" | "dedupe" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [result, setResult] = useState<DuplicateScanResult | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [fitRequestId, setFitRequestId] = useState(0);
  const mapSectionRef = useRef<HTMLElement | null>(null);

  function handleMapChange(nextMapId: string) {
    setMapId(nextMapId);
    const next = maps.find((map) => map.id === nextMapId);
    setVersionId(next?.versions[0]?.id ?? "");
    setResult(null);
    setError(null);
    setActionMessage(null);
    setSelectedKey(null);
  }

  async function handleScan() {
    if (!versionId) return;
    setLoading(true);
    setError(null);
    setActionMessage(null);
    setResult(null);
    setSelectedKey(null);
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
      setFitRequestId((id) => id + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Skanning misslyckades");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!result || result.duplicateGroupCount === 0) return;
    const frame = window.requestAnimationFrame(() => {
      mapSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [result]);

  const selectedGroup = useMemo(
    () => result?.groups.find((group) => group.key === selectedKey) ?? null,
    [result, selectedKey],
  );

  const clickableItems = useMemo(() => {
    if (!result?.groups.length) return [];
    return result.groups.map((group, index) => ({
      change: groupToChange(group),
      index,
    }));
  }, [result]);

  const focusTarget = useMemo(() => {
    if (!selectedGroup) return null;
    return {
      bbox: groupBbox(selectedGroup),
      centroid: selectedGroup.centroid,
      objectType: selectedGroup.type,
    };
  }, [selectedGroup]);

  const fitGeoBbox = useMemo(() => {
    if (!result?.groups.length || selectedKey) return null;
    const bbox = groupsToFitBbox(result.groups);
    if (!bbox) return null;
    return { bbox, requestId: fitRequestId };
  }, [result, selectedKey, fitRequestId]);

  const renderScreenOverlay = useCallback(
    ({
      projectGeo,
    }: {
      projectGeo: (geo: [number, number]) => { x: number; y: number } | null;
    }) => {
      if (!result?.groups.length) return null;
      return (
        <g>
          {result.groups.map((group) => {
            const point = projectGeo(group.centroid);
            if (!point) return null;
            const selected = group.key === selectedKey;
            const r = selected ? 11 : 8;
            return (
              <g key={group.key} transform={`translate(${point.x} ${point.y})`}>
                <circle r={r + 2} fill="none" stroke="white" strokeWidth={2} />
                <circle
                  r={r}
                  fill={selected ? "#b45309" : "#f59e0b"}
                  stroke={selected ? "#78350f" : "#b45309"}
                  strokeWidth={1.5}
                />
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="white"
                  fontSize={selected ? 11 : 10}
                  fontWeight={700}
                  style={{ pointerEvents: "none" }}
                >
                  {group.count > 9 ? "9+" : group.count}
                </text>
              </g>
            );
          })}
        </g>
      );
    },
    [result, selectedKey],
  );

  function selectGroup(key: string | null) {
    setSelectedKey(key);
  }

  async function downloadExport(kind: "duplicates" | "uniques") {
    if (!result) return;
    setActionBusy(kind === "duplicates" ? "export-dup" : "export-unique");
    setError(null);
    setActionMessage(null);
    try {
      const res = await fetch(
        `/api/admin/duplicates/export?versionId=${encodeURIComponent(result.version.id)}&kind=${kind}`,
      );
      if (!res.ok) {
        const { message } = await readApiError(res, "Export misslyckades");
        setError(message);
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const fileName =
        match?.[1] ??
        (kind === "duplicates" ? "dubbletter.ocd" : "unika.ocd");
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(url);
      setActionMessage(
        kind === "duplicates"
          ? "Nedladdning av dubbletter startad."
          : "Nedladdning av unika objekt startad.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export misslyckades");
    } finally {
      setActionBusy(null);
    }
  }

  async function handleDedupe() {
    if (!result) return;
    const ok = window.confirm(
      `Ta bort ${result.extraDuplicateCount} extra dubbletter från v${result.version.versionNumber}?\n\n` +
        `I varje grupp behålls objektet med lägst index. En ny opublicerad version skapas.`,
    );
    if (!ok) return;

    setActionBusy("dedupe");
    setError(null);
    setActionMessage(null);
    try {
      const res = await fetch("/api/admin/duplicates/dedupe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: result.version.id }),
      });
      if (!res.ok) {
        const { message } = await readApiError(res, "Borttagning misslyckades");
        setError(message);
        return;
      }
      const data = (await res.json()) as {
        versionId: string;
        versionNumber: number;
        deletedCount: number;
      };
      setActionMessage(
        `Skapade v${data.versionNumber} utan ${data.deletedCount} extra dubbletter. Versionen är vald — skanna igen för att kontrollera.`,
      );
      setVersionId(data.versionId);
      setResult(null);
      setSelectedKey(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Borttagning misslyckades");
    } finally {
      setActionBusy(null);
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
            Skanna en version efter exakta dubbletter (samma symbol, geometri och text). När
            skanningen är klar visas resultatet{" "}
            <strong>direkt på en karta här på sidan</strong> — du behöver inte öppna något
            separat.
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
                setSelectedKey(null);
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

      {actionMessage && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {actionMessage}
        </div>
      )}

      {result && (
        <>
          <section className="card space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Sammanfattning</h2>
                <p className="mt-1 text-sm text-slate-600">
                  <MapName title={result.map.title} areaType={result.map.areaType} /> · v
                  {result.version.versionNumber}
                  {result.version.isPublished ? " (publicerad)" : ""} · {result.objectCount} objekt
                  · {(result.scanDurationMs / 1000).toFixed(1)} s
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {result.duplicateGroupCount > 0 && (
                  <a
                    href="#dubblett-karta"
                    className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600"
                  >
                    Visa dubbletter på kartan ↓
                  </a>
                )}
                <Link
                  href={`/maps/${result.map.slug}`}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Till områdessidan
                </Link>
              </div>
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

            {result.duplicateGroupCount === 0 && (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                Inga exakta dubbletter hittades — ingen karta behövs.
              </p>
            )}

            {result.duplicateGroupCount > 0 && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                <p className="text-sm font-medium text-slate-900">Åtgärder</p>
                <p className="mt-1 text-xs text-slate-600">
                  Export tar ut delmängder till .ocd. «Radera dubbletter» behåller lågst index i
                  varje grupp och skapar en ny opublicerad version.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={actionBusy != null}
                    onClick={() => void downloadExport("duplicates")}
                    className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-50 disabled:opacity-50"
                  >
                    {actionBusy === "export-dup"
                      ? "Exporterar…"
                      : "Exportera dubbletter (.ocd)"}
                  </button>
                  <button
                    type="button"
                    disabled={actionBusy != null}
                    onClick={() => void downloadExport("uniques")}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {actionBusy === "export-unique"
                      ? "Exporterar…"
                      : "Exportera unika (.ocd)"}
                  </button>
                  <button
                    type="button"
                    disabled={actionBusy != null}
                    onClick={() => void handleDedupe()}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {actionBusy === "dedupe"
                      ? "Tar bort…"
                      : `Radera dubbletter (${result.extraDuplicateCount})`}
                  </button>
                </div>
              </div>
            )}
          </section>

          {result.duplicateGroupCount > 0 && (
            <>
              <section
                id="dubblett-karta"
                ref={mapSectionRef}
                className="scroll-mt-4 space-y-3 rounded-xl border-2 border-amber-300 bg-amber-50/40 p-4 sm:p-5"
              >
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">Dubbletter på kartan</h2>
                  <p className="mt-1 text-sm text-slate-700">
                    Orangemarkörer visar var dubbletterna ligger (siffran = antal kopior). Klicka
                    en markör eller en rad i listan nedan för att zooma. Kartan laddas som
                    förhandsvisning (utan tile-bygge) så den ska komma upp även på stora filer.
                  </p>
                </div>
                <DiffMapPanel
                  previewUrl={`/api/maps/${result.map.slug}/versions/${result.version.id}/preview`}
                  title="Dubbletter på kartan"
                  mapSlug={result.map.slug}
                  versionId={result.version.id}
                  basemap="svg"
                  exportEnabled={false}
                  showLayerPanel={false}
                  focusTarget={focusTarget}
                  selectedChange={selectedGroup ? groupToChange(selectedGroup) : null}
                  clickableItems={clickableItems}
                  onClearFocus={() => selectGroup(null)}
                  onObjectClick={(index) => {
                    const group = result.groups[index];
                    if (group) selectGroup(group.key);
                  }}
                  fitGeoBbox={fitGeoBbox}
                  renderScreenOverlay={renderScreenOverlay}
                  viewportClassName="h-[min(70svh,560px)] min-h-[320px]"
                />
              </section>

              <section className="card space-y-3">
                <h2 className="text-lg font-semibold text-slate-900">Lista</h2>
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
                      {result.groups.map((group) => {
                        const selected = group.key === selectedKey;
                        return (
                          <tr
                            key={group.key}
                            className={`cursor-pointer border-b border-slate-100 last:border-0 ${
                              selected ? "bg-amber-50" : "hover:bg-slate-50"
                            }`}
                            onClick={() => {
                              selectGroup(selected ? null : group.key);
                              mapSectionRef.current?.scrollIntoView({
                                behavior: "smooth",
                                block: "nearest",
                              });
                            }}
                          >
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
                            <td className="px-3 py-2 text-slate-600">
                              {objectTypeLabel(group.type)}
                            </td>
                            <td className="px-3 py-2 tabular-nums text-slate-900">
                              ×{group.count}
                            </td>
                            <td className="px-3 py-2 font-mono text-xs text-slate-600">
                              ({Math.round(group.centroid[0])}, {Math.round(group.centroid[1])})
                            </td>
                            <td className="px-3 py-2 font-mono text-xs text-slate-600">
                              {formatIndices(group.objectIndices)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-slate-500">
                  Exakt dubblett = samma symbolnummer, samma geometrihash och samma text. Ta bort
                  överflödiga kopior i OCAD Desktop och ladda upp en ny version.
                </p>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
