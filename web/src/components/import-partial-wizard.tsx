"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ImportPartialMapPreview } from "@/components/import-partial-map-preview";
import type { ImportPartialAnalysis } from "@/lib/checkout/import-partial-types";
import {
  uploadImportPartial,
  type ImportPartialUploadProgress,
} from "@/lib/upload-client";

type StepId = "upload" | "symbols" | "extent" | "edges" | "diff" | "confirm";

const STEPS: { id: StepId; title: string; hint: string }[] = [
  { id: "upload", title: "1. Välj fil", hint: "Ladda upp den redigerade delkartan (.ocd)." },
  { id: "symbols", title: "2. Symboler", hint: "Kontrollera att symbolnumren stämmer med den stora kartan." },
  { id: "extent", title: "3. Läge", hint: "Polygonen ska ligga på rätt ställe på den stora kartan." },
  { id: "edges", title: "4. Kanter", hint: "Kantzon (~30 m) och klippta objekt jämförs inte som borttag — originalet utanför/kärnan skyddas." },
  { id: "diff", title: "5. Ändringar", hint: "Tillagt, borttaget och ändrat i den inre kärnan av polygonen." },
  { id: "confirm", title: "6. Bekräfta", hint: "Skapar en utcheckning i efterhand. Inget slås ihop förrän du och admin bekräftar." },
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

function formatElapsed(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m <= 0) return `${s} s`;
  return `${m} min ${s.toString().padStart(2, "0")} s`;
}

function WorkingSpinner({ className = "" }: { className?: string }) {
  return (
    <div
      className={`mx-auto h-9 w-9 animate-spin rounded-full border-2 border-slate-300 border-t-ifk-blue ${className}`}
      role="status"
      aria-label="Arbetar"
    />
  );
}

export function ImportPartialWizard({ mapSlug, mapTitle, headVersionId }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<StepId>("upload");
  const [fileName, setFileName] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ImportPartialAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [progress, setProgress] = useState<ImportPartialUploadProgress | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  // Endast redan genererad SVG — regenerering av kartbilden kan ta en minut och ge 500.
  const previewUrl = `/api/maps/${mapSlug}/versions/${headVersionId}/preview?cached=1`;
  const stepIndex = STEPS.findIndex((entry) => entry.id === step);
  const blockers = analysis?.blockers ?? [];
  const symbolBlocked = (analysis?.symbols.onlyInPartial.length ?? 0) > 0;
  const otherBlockers = blockers.filter((item) => !item.includes("symboler som saknas"));
  const canProceedPastSymbols = !symbolBlocked;
  const canCommit = blockers.length === 0;
  const mapMode = step === "extent" || step === "edges" || step === "diff" ? step : null;

  useEffect(() => {
    if (!loading) {
      setElapsedSec(0);
      return;
    }
    const started = Date.now();
    setElapsedSec(0);
    const timer = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [loading]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setLoading(true);
    setAcknowledged(false);
    setProgress({
      status: "uploading",
      label: "Laddar upp delkartan",
      detail: file.name,
    });
    try {
      const res = await uploadImportPartial(mapSlug, file, {
        onProgress: (next) => setProgress(next),
      });
      const raw = await res.text();
      let data: {
        error?: string;
        jobId?: string;
        analysis?: ImportPartialAnalysis;
        fileName?: string;
      } = {};
      try {
        data = raw ? (JSON.parse(raw) as typeof data) : {};
      } catch {
        throw new Error(
          res.ok
            ? "Servern svarade felaktigt. Försök igen."
            : `Kunde inte analysera filen (HTTP ${res.status}). Stora kartor kan ta flera minuter — försök igen.`,
        );
      }
      if (!res.ok) throw new Error(data.error ?? "Kunde inte analysera filen");
      if (!data.jobId || !data.analysis) throw new Error("Ogiltigt svar från servern");
      setJobId(data.jobId);
      setAnalysis(data.analysis);
      setFileName(data.fileName ?? file.name);
      setProgress(null);
      setStep("symbols");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte analysera filen");
      setProgress(null);
    } finally {
      setLoading(false);
    }
  }

  async function commit() {
    if (!jobId) return;
    setError(null);
    setLoading(true);
    setProgress({
      status: "analyzing",
      label: "Skapar utcheckning",
      detail: "Exporterar urval och checkar in delkartan…",
    });
    try {
      const res = await fetch(`/api/maps/${mapSlug}/import-partial/${jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
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
      setProgress(null);
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

      {step === "upload" && !loading && (
        <label className="block rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center">
          <input
            type="file"
            accept=".ocd"
            className="sr-only"
            disabled={loading}
            onChange={(event) => void onFile(event.target.files?.[0])}
          />
          <span className="text-sm font-medium text-ifk-blue">Välj .ocd-fil</span>
          <span className="mt-1 block text-xs text-slate-500">
            Samma karta som området, redigerad i OCAD — även om den aldrig checkades ut här.
          </span>
        </label>
      )}

      {step === "upload" && loading && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-8 text-center">
          <WorkingSpinner className="border-amber-300 border-t-amber-700" />
          <p className="mt-4 text-sm font-medium text-amber-950">
            {progress?.label ?? "Analyserar delkartan…"}
          </p>
          {progress?.detail && (
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-700">{progress.detail}</p>
          )}
          <p className="mt-3 text-xs text-amber-900/80">
            Förfluten tid: {formatElapsed(elapsedSec)}
            {elapsedSec >= 60
              ? " — stora kartor (t.ex. Mora Väst) kan ta flera minuter att parsa."
              : ""}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Sidan uppdaterar status automatiskt medan analysen körs.
          </p>
        </div>
      )}

      {step === "confirm" && loading && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-6 text-center">
          <WorkingSpinner className="border-amber-300 border-t-amber-700" />
          <p className="mt-3 text-sm font-medium text-amber-950">
            {progress?.label ?? "Skapar utcheckning…"}
          </p>
          {progress?.detail && <p className="mt-1 text-sm text-slate-700">{progress.detail}</p>}
          <p className="mt-2 text-xs text-amber-900/80">Förfluten tid: {formatElapsed(elapsedSec)}</p>
        </div>
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

      {analysis && (step === "extent" || step === "edges" || step === "diff") &&
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
          analysis={analysis}
          mode={mapMode}
          areaHref={`/maps/${mapSlug}`}
          title={
            mapMode === "extent" ? "Utbredning" : mapMode === "edges" ? "Kantobjekt" : "Ändringar"
          }
        />
      )}

      {analysis && step === "extent" && (
        <p className="text-sm text-slate-600">
          Blå linje är delkartans utbredning (rutnätskontur utifrån objekten). Blåtonat = skyddad
          zon där inget raderas automatiskt: {analysis.edgeBufferMeters ?? 60} m in från delkartans
          innehåll, plus eventuella tomrum där delkartan inte ritat något. Innanför den gröna
          streckade linjen jämförs borttag. Fil: <span className="font-medium">{fileName}</span>.
          Jämför{" "}
          {analysis.headObjectsInArea.toLocaleString("sv-SE")} objekt i området av{" "}
          {analysis.headObjectsTotal.toLocaleString("sv-SE")} på stora kartan.
        </p>
      )}

      {analysis && step === "edges" && (
        <div className="space-y-2 text-sm text-slate-600">
          <p>
            Orange/rött = kantobjekt som skär, ligger i skyddszonen ({analysis.edgeBufferMeters} m
            från delkartans innehåll) eller är klippta ({analysis.edgeCount} visade). Rött betyder
            troligen klippt (
            {analysis.likelyClippedCount} st) och räknas inte som ändring.{" "}
            {analysis.interiorCount} objekt ligger i den inre kärnan. Zonen mäts mot hela objektet,
            så en bäck eller stig som når kanten skyddas även om mitten ligger långt in. Objekt i
            tomrum där delkartan inte har något innehåll behålls också.
          </p>
          <p>
            Kartan visas alltid under markeringarna så att du kan bedöma varje ändring i sitt
            sammanhang; <span className="font-medium">Dämpa kartan</span> lägger en slöja över den
            när markeringarna drunknar i kartfärgerna. Linjer och ytor ritas med sin egen form,
            punktobjekt som ring. Kryssa i{" "}
            <span className="font-medium">Raderas i original</span>,{" "}
            <span className="font-medium">Nya i delkartan</span> och{" "}
            <span className="font-medium">Ändrade / ersatta</span> för att jämföra vad som tas bort
            mot vad som kommer in (streckad röd = raderas).
          </p>
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
            Använd samma kartväxling som i steget Kanter: hela kartan eller bara berörda objekt, och
            filtrera tillagda / borttagna / ändrade.
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

      {analysis && step === "confirm" && !loading && (
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
            En utcheckning skapas från delkartans utbredning och filen checkas in. Därefter granskar
            du diffen som vanligt och admin integrerar.
          </p>
          <ul className="list-disc pl-5">
            <li>
              {analysis.diff.added} tillägg, {analysis.diff.modified} ändringar, {analysis.diff.removed}{" "}
              borttagningar (skyddszon {analysis.edgeBufferMeters} m från delkartans innehåll, och
              klippta objekt jämförs inte som borttag)
            </li>
            <li>{analysis.likelyClippedCount} objekt markerade som troligen klippta (filtreras bort)</li>
            <li>
              {analysis.headObjectsInArea.toLocaleString("sv-SE")} av{" "}
              {analysis.headObjectsTotal.toLocaleString("sv-SE")} objekt på stora kartan ingår i jämförelsen
            </li>
          </ul>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            <span>
              Jag har kontrollerat symboler, läge och kanter. Delkartan tillhör det här området.
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
              disabled={loading}
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
            disabled={loading || (step === "symbols" && !canProceedPastSymbols)}
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
