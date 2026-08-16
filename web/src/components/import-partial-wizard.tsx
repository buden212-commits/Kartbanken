"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ImportPartialMapPreview } from "@/components/import-partial-map-preview";
import type { ImportPartialAnalysis } from "@/lib/checkout/import-partial-types";
import type { CheckoutSelectionGeometry } from "@/lib/checkout/types";
import { uploadImportPartial } from "@/lib/upload-client";

type StepId = "upload" | "symbols" | "extent" | "edges" | "diff" | "confirm";

const STEPS: { id: StepId; title: string; hint: string }[] = [
  { id: "upload", title: "1. Välj fil", hint: "Ladda upp den redigerade delkartan (.ocd)." },
  { id: "symbols", title: "2. Symboler", hint: "Kontrollera att symbolnumren stämmer med den stora kartan." },
  { id: "extent", title: "3. Läge", hint: "Ramen ska ligga på rätt ställe på den stora kartan." },
  {
    id: "edges",
    title: "4. Kanter",
    hint: "Jämför grundkarta och import, justera gränsen och granska riskzonen (40 m).",
  },
  { id: "diff", title: "5. Ändringar", hint: "Tillagt, borttaget och ändrat inne i det säkra området." },
  {
    id: "confirm",
    title: "6. Bekräfta",
    hint: "Skapar en utcheckning i efterhand. Inget slås ihop förrän du och admin bekräftar.",
  },
];

type Props = {
  mapSlug: string;
  mapTitle: string;
  headVersionId: string;
};

function changeLabel(type: "added" | "removed" | "modified"): string {
  if (type === "added") return "Tillagd";
  if (type === "removed") return "Borttagen";
  return "Ändrad";
}

export function ImportPartialWizard({ mapSlug, mapTitle, headVersionId }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<StepId>("upload");
  const [fileName, setFileName] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ImportPartialAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [boundaryBusy, setBoundaryBusy] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [forceDeleteObjectIndices, setForceDeleteObjectIndices] = useState<number[]>([]);
  const [selectedRiskObjectIndex, setSelectedRiskObjectIndex] = useState<number | null>(null);

  const previewUrl = `/api/maps/${mapSlug}/versions/${headVersionId}/preview?cached=1`;
  const importPreviewUrl = jobId
    ? `/api/maps/${mapSlug}/import-partial/${jobId}/preview`
    : null;
  const stepIndex = STEPS.findIndex((entry) => entry.id === step);
  const blockers = analysis?.blockers ?? [];
  const symbolBlocked = (analysis?.symbols.onlyInPartial.length ?? 0) > 0;
  const otherBlockers = blockers.filter((item) => !item.includes("symboler som saknas"));
  const canProceedPastSymbols = !symbolBlocked;
  const canCommit = blockers.length === 0;
  const mapMode = step === "extent" || step === "edges" || step === "diff" ? step : null;
  const riskRemovals = analysis?.riskRemovals ?? [];
  const forceDeleteCount = forceDeleteObjectIndices.length;
  const keepRiskCount = Math.max(0, riskRemovals.length - forceDeleteCount);

  const forceDeleteSet = useMemo(
    () => new Set(forceDeleteObjectIndices),
    [forceDeleteObjectIndices],
  );

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setLoading(true);
    setAcknowledged(false);
    setRiskReviewed(false);
    setForceDeleteObjectIndices([]);
    setSelectedRiskObjectIndex(null);
    try {
      const res = await uploadImportPartial(mapSlug, file);
      const data = (await res.json()) as {
        error?: string;
        jobId?: string;
        analysis?: ImportPartialAnalysis;
        fileName?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Kunde inte analysera filen");
      if (!data.jobId || !data.analysis) throw new Error("Ogiltigt svar från servern");
      setJobId(data.jobId);
      setAnalysis(data.analysis);
      setFileName(data.fileName ?? file.name);
      setStep("symbols");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte analysera filen");
    } finally {
      setLoading(false);
    }
  }

  async function commitBoundary(boundary: CheckoutSelectionGeometry) {
    if (!jobId) return;
    setBoundaryBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/maps/${mapSlug}/import-partial/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boundary }),
      });
      const data = (await res.json()) as { error?: string; analysis?: ImportPartialAnalysis };
      if (!res.ok) throw new Error(data.error ?? "Kunde inte uppdatera gränsen");
      if (!data.analysis) throw new Error("Analys saknas i svaret");
      setAnalysis(data.analysis);
      setForceDeleteObjectIndices([]);
      setSelectedRiskObjectIndex(null);
      setRiskReviewed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte uppdatera gränsen");
    } finally {
      setBoundaryBusy(false);
    }
  }

  function toggleForceDelete(objectIndex: number) {
    setForceDeleteObjectIndices((prev) =>
      prev.includes(objectIndex)
        ? prev.filter((value) => value !== objectIndex)
        : [...prev, objectIndex],
    );
  }

  async function commit() {
    if (!jobId || !analysis) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/maps/${mapSlug}/import-partial/${jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          boundary: analysis.boundary,
          forceDeleteObjectIndices,
        }),
      });
      const raw = await res.text();
      let data: { error?: string; checkoutId?: string } = {};
      try {
        data = raw ? (JSON.parse(raw) as { error?: string; checkoutId?: string }) : {};
      } catch {
        throw new Error(
          res.ok
            ? "Servern svarade felaktigt. Försök igen."
            : `Kunde inte skapa utcheckning (HTTP ${res.status}). Försök igen — stora kartor kan ta en stund.`,
        );
      }
      if (!res.ok) throw new Error(data.error ?? "Kunde inte skapa utcheckning");
      if (!data.checkoutId) throw new Error("Utcheckning saknas i svaret");
      router.push(`/maps/${mapSlug}/checkout/${data.checkoutId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte skapa utcheckning");
      setLoading(false);
    }
  }

  function goNext() {
    const next = STEPS[stepIndex + 1];
    if (next) setStep(next.id);
  }

  function goPrev() {
    const prev = STEPS[stepIndex - 1];
    if (prev) setStep(prev.id);
  }

  return (
    <div className="space-y-6">
      <ol className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {STEPS.map((entry, index) => {
          const active = entry.id === step;
          const done = index < stepIndex;
          return (
            <li
              key={entry.id}
              className={`rounded-lg border px-3 py-2 text-xs ${
                active
                  ? "border-ifk-blue bg-ifk-blue-pale text-ifk-blue"
                  : done
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 bg-white text-slate-500"
              }`}
            >
              <p className="font-medium">{entry.title}</p>
            </li>
          );
        })}
      </ol>

      <p className="text-sm text-slate-600">{STEPS[stepIndex]?.hint}</p>
      <p className="text-xs text-slate-500">
        Jämförs mot {mapTitle}, aktuell version. Inget skrivs till kartan förrän sista steget.
      </p>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {step === "upload" && (
        <label className="block rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center">
          <input
            type="file"
            accept=".ocd"
            className="sr-only"
            disabled={loading}
            onChange={(event) => void onFile(event.target.files?.[0])}
          />
          <span className="text-sm font-medium text-ifk-blue">
            {loading ? "Analyserar delkartan…" : "Välj .ocd-fil"}
          </span>
          <span className="mt-1 block text-xs text-slate-500">
            Samma karta som området, redigerad i OCAD — även om den aldrig checkades ut här.
          </span>
        </label>
      )}

      {analysis && step === "symbols" && (
        <div className="space-y-4">
          {blockers.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              <p className="font-medium">
                {symbolBlocked ? "Kan inte fortsätta förrän symbolerna stämmer" : "Kan inte importera ännu"}
              </p>
              <ul className="mt-1 list-disc pl-5">
                {blockers.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {analysis.warnings.length > 0 && blockers.length === 0 && (
            <ul className="list-disc rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 pl-8 text-sm text-amber-900">
              {analysis.warnings.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
          <SymbolTable
            title="Matchande symboler i båda filerna"
            rows={analysis.symbols.matched}
            empty="Inga gemensamma symboler."
          />
          <SymbolTable
            title="Bara i delkartan (blockerar import)"
            rows={analysis.symbols.onlyInPartial}
            empty="Inga — bra."
            danger
          />
          <SymbolTable
            title="Finns i området på stora kartan men inte i delkartan"
            rows={analysis.symbols.onlyInHeadUsedByPartialArea}
            empty="Inga extra symboler i området."
          />
        </div>
      )}

      {analysis && (step === "extent" || step === "edges" || step === "diff") && otherBlockers.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <ul className="list-disc pl-5">
            {otherBlockers.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {analysis &&
        (step === "extent" || step === "edges" || step === "diff") &&
        analysis.warnings.length > 0 &&
        otherBlockers.length === 0 && (
          <ul className="list-disc rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 pl-8 text-sm text-amber-900">
            {analysis.warnings.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}

      {analysis && mapMode && (
        <ImportPartialMapPreview
          previewUrl={previewUrl}
          importPreviewUrl={mapMode === "edges" ? importPreviewUrl : null}
          analysis={analysis}
          mode={mapMode}
          areaHref={`/maps/${mapSlug}`}
          title={
            mapMode === "extent" ? "Utbredning" : mapMode === "edges" ? "Kanter & riskzon" : "Ändringar"
          }
          forceDeleteObjectIndices={forceDeleteObjectIndices}
          selectedRiskObjectIndex={selectedRiskObjectIndex}
          onSelectRiskObject={setSelectedRiskObjectIndex}
          onBoundaryCommit={mapMode === "edges" ? commitBoundary : undefined}
          boundaryBusy={boundaryBusy}
        />
      )}

      {analysis && step === "extent" && (
        <p className="text-sm text-slate-600">
          {analysis.boundarySource === "symbol-1104.001" ? (
            <>
              Importgränsen kommer från områdessymbol <span className="font-medium">1104.001</span> i
              delkartan (polygon). Kontrollera att den ligger rätt. Fil:{" "}
              <span className="font-medium">{fileName}</span>.
            </>
          ) : (
            <>
              Blå ram är delkartans utbredning. Zooma och kontrollera att den ligger rätt. Fil:{" "}
              <span className="font-medium">{fileName}</span>. I nästa steg kan du rita en egen
              polygon om området inte är en rektangel — eller lägga till symbol 1104.001 i OCAD.
            </>
          )}
        </p>
      )}

      {analysis && step === "edges" && (
        <div className="space-y-4 text-sm text-slate-600">
          <p>
            Grundkartan visas nedtonad med importkartan ovanpå. Orange streckad ram = säker zon innanför
            riskbufferten ({analysis.riskZoneMeters ?? 40} m). Objekt i riskzonen raderas inte
            automatiskt — välj «Radera» per rad om det ska bort.
          </p>
          <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-medium text-amber-950">
                  Objekt i riskzonen ({riskRemovals.length})
                </h3>
                <p className="mt-1 text-xs text-amber-900">
                  {keepRiskCount} behålls · {forceDeleteCount} markeras för radering
                </p>
              </div>
            </div>
            {riskRemovals.length === 0 ? (
              <p className="mt-3 text-xs text-amber-900">Inga skyddade borttagningskandidater i riskzonen.</p>
            ) : (
              <ul className="mt-3 max-h-64 divide-y divide-amber-100 overflow-y-auto rounded-lg border border-amber-200 bg-white text-xs">
                {riskRemovals.map((item) => {
                  const marked = forceDeleteSet.has(item.objectIndex);
                  const selected = selectedRiskObjectIndex === item.objectIndex;
                  return (
                    <li
                      key={item.objectIndex}
                      className={`flex flex-wrap items-center gap-2 px-3 py-2 ${
                        selected ? "bg-ifk-blue-pale/60" : ""
                      }`}
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => setSelectedRiskObjectIndex(item.objectIndex)}
                      >
                        <span className="font-mono text-slate-500">{item.symbolNumber}</span>{" "}
                        <span className="text-slate-800">{item.symbolName}</span>{" "}
                        <span className="text-slate-400">({item.type})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleForceDelete(item.objectIndex)}
                        className={`rounded-md px-2 py-1 text-xs font-medium ${
                          marked
                            ? "bg-red-600 text-white"
                            : "border border-emerald-300 bg-emerald-50 text-emerald-800"
                        }`}
                      >
                        {marked ? "Raderas — klicka för behåll" : "Behålls — klicka för radera"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      {analysis && step === "diff" && (
        <div className="space-y-3 text-sm">
          <p className="text-slate-700">
            <span className="font-medium text-emerald-700">{analysis.diff.added} tillagda</span>
            {" · "}
            <span className="font-medium text-red-700">{analysis.diff.removed} borttagna</span>
            {" · "}
            <span className="font-medium text-amber-700">{analysis.diff.modified} ändrade</span>
            {" · "}
            {analysis.diff.unchanged} oförändrade i området
          </p>
          <p className="text-slate-600">
            Siffrorna gäller det säkra området. {keepRiskCount} riskzonsobjekt behålls och{" "}
            {forceDeleteCount} raderas enligt ditt val under Kanter.
          </p>
          {analysis.diff.samples.length > 0 && (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-xs">
              {analysis.diff.samples.map((change, index) => (
                <li key={`${change.objectIndex}-${index}`} className="flex gap-3 px-3 py-2">
                  <span className="w-20 shrink-0 font-medium">{changeLabel(change.changeType)}</span>
                  <span className="font-mono text-slate-500">{change.symbolNumber}</span>
                  <span>{change.symbolName}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {analysis && step === "confirm" && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
          {otherBlockers.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800">
              <ul className="list-disc pl-5">
                {otherBlockers.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          <p>
            En utcheckning skapas från importgränsen och filen checkas in. Därefter granskar du
            diffen som vanligt och admin integrerar — riskzonsvalen följer med oförändrade.
          </p>
          <ul className="list-disc pl-5">
            <li>
              {analysis.diff.added} tillägg, {analysis.diff.modified} ändringar, {analysis.diff.removed}{" "}
              auto-borttagningar i säkra zonen
            </li>
            <li>
              Riskzon: {keepRiskCount} behålls · {forceDeleteCount} raderas enligt granskning
            </li>
            <li>
              Gräns:{" "}
              {analysis.boundarySource === "symbol-1104.001"
                ? "polygon från symbol 1104.001"
                : analysis.boundary?.type === "POLYGON"
                  ? "ritad polygon"
                  : "blå rektangel"}
            </li>
            <li>{analysis.likelyClippedCount} objekt markerade som troligen klippta</li>
          </ul>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            <span>
              Jag har kontrollerat symboler, läge, kanter och riskzon. Delkartan tillhör det här
              området.
            </span>
          </label>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {step !== "upload" && (
            <button
              type="button"
              onClick={goPrev}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700"
              disabled={loading || boundaryBusy}
            >
              Tillbaka
            </button>
          )}
          <Link
            href={`/maps/${mapSlug}`}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700"
          >
            Avbryt
          </Link>
        </div>
        {step !== "upload" && step !== "confirm" && (
          <button
            type="button"
            onClick={goNext}
            disabled={
              loading ||
              boundaryBusy ||
              (step === "symbols" && !canProceedPastSymbols)
            }
            className="btn-primary"
          >
            Nästa
          </button>
        )}
        {step === "confirm" && (
          <button
            type="button"
            onClick={() => void commit()}
            disabled={loading || !acknowledged || !canCommit}
            className="btn-primary"
          >
            {loading ? "Skapar utcheckning…" : "Skapa utcheckning och checka in"}
          </button>
        )}
      </div>
    </div>
  );
}

function SymbolTable({
  title,
  rows,
  empty,
  danger = false,
}: {
  title: string;
  rows: ImportPartialAnalysis["symbols"]["matched"];
  empty: string;
  danger?: boolean;
}) {
  return (
    <section>
      <h3 className={`text-sm font-medium ${danger ? "text-red-800" : "text-slate-900"}`}>{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-1 text-xs text-slate-500">{empty}</p>
      ) : (
        <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[28rem] text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Nr</th>
                <th className="px-3 py-2 font-medium">Stor karta</th>
                <th className="px-3 py-2 font-medium">Delkarta</th>
                <th className="px-3 py-2 font-medium">Antal i delkarta</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.number} className="border-t border-slate-100">
                  <td className="px-3 py-1.5 font-mono">{row.number}</td>
                  <td className="px-3 py-1.5">{row.nameHead || "—"}</td>
                  <td className="px-3 py-1.5">{row.namePartial || "—"}</td>
                  <td className="px-3 py-1.5">{row.countPartial || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
