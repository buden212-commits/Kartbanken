"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DiffMapPanel, type MapDrawPointerHandlers } from "@/components/diff-map-panel";
import {
  CheckoutSelectionType,
  type CheckoutSelection,
  type CheckoutSelectionGeometry,
} from "@/lib/checkout/types";
import type { FieldEditOps } from "@/lib/field-edit/types";
import { findNearestMapFeature, type MapHitIndexEntry } from "@/lib/ocad/map-hit-index";
import { screenToSvgPoint } from "@/lib/ocad/map-hit-test";
import {
  geoBboxToSvgUser,
  geoToSvgUserPoint,
  IDENTITY_SVG_TRANSFORM,
  svgUserToGeoPoint,
  type SvgRootTransform,
} from "@/lib/ocad/svg-coords";
import { flattenOcadLayers, formatOcadSymbolNumber, type OcadMapLayer } from "@/lib/ocad/layers";
import { OCAD_POINT_SYMBOL } from "@/lib/ocad/ocad-object-create";
import { parseOcadLayersFromSvg, parseOcadMapScale } from "@/lib/ocad/svg-utils";
import { fetchPreviewText } from "@/lib/ocad/preview-fetch";

type FieldEditTool = "delete" | "addPoint";

type Props = {
  mapSlug: string;
  mapTitle: string;
  sessionId: string;
  versionId: string;
  selection: CheckoutSelection;
  initialOps: FieldEditOps;
};

function selectionOverlaySvg(
  geometry: CheckoutSelectionGeometry,
  transform: SvgRootTransform,
): string {
  if (geometry.type === CheckoutSelectionType.BBOX) {
    const [minX, minY, maxX, maxY] = geoBboxToSvgUser(
      [geometry.bbox.minX, geometry.bbox.minY, geometry.bbox.maxX, geometry.bbox.maxY],
      transform,
    );
    return `<polygon points="${minX},${minY} ${maxX},${minY} ${maxX},${maxY} ${minX},${maxY}" fill="rgba(59,130,246,0.12)" stroke="#2563eb" stroke-width="2" stroke-dasharray="6 4" />`;
  }
  const points = geometry.ring
    .map(([x, y]) => {
      const [sx, sy] = geoToSvgUserPoint([x, y], transform);
      return `${sx},${sy}`;
    })
    .join(" ");
  return `<polygon points="${points}" fill="rgba(59,130,246,0.12)" stroke="#2563eb" stroke-width="2" stroke-dasharray="6 4" />`;
}

function opsOverlaySvg(
  ops: FieldEditOps,
  transform: SvgRootTransform,
  hitIndex: MapHitIndexEntry[],
): string {
  const parts: string[] = [];
  for (const objectIndex of ops.deletes) {
    const entry = hitIndex.find((item) => item.i === objectIndex);
    if (!entry) continue;
    const [x, y] = geoToSvgUserPoint(entry.c, transform);
    parts.push(
      `<g><line x1="${x - 8}" y1="${y - 8}" x2="${x + 8}" y2="${y + 8}" stroke="#dc2626" stroke-width="3" /><line x1="${x + 8}" y1="${y - 8}" x2="${x - 8}" y2="${y + 8}" stroke="#dc2626" stroke-width="3" /></g>`,
    );
  }
  for (const add of ops.adds) {
    const [x, y] = geoToSvgUserPoint([add.x, add.y], transform);
    parts.push(
      `<circle cx="${x}" cy="${y}" r="7" fill="rgba(34,197,94,0.35)" stroke="#16a34a" stroke-width="2" /><text x="${x + 10}" y="${y - 10}" font-size="11" fill="#166534">${add.symbolNumber}</text>`,
    );
  }
  return parts.join("");
}

function pointSymbolChoices(layers: OcadMapLayer[]) {
  const seen = new Set<number>();
  const choices: Array<{ symNum: number; label: string }> = [];
  for (const layer of flattenOcadLayers(layers)) {
    if (layer.kind !== "symbol" || layer.symbolNum == null) continue;
    if (layer.symbolType != null && layer.symbolType !== OCAD_POINT_SYMBOL) continue;
    if (seen.has(layer.symbolNum)) continue;
    seen.add(layer.symbolNum);
    const formatted = formatOcadSymbolNumber(layer.symbolNum);
    const desc = layer.name.replace(/^\d+(?:\.\d+)?\s*/, "").trim();
    choices.push({
      symNum: layer.symbolNum,
      label: desc ? `${formatted} ${desc}` : formatted,
    });
  }
  choices.sort((a, b) => a.label.localeCompare(b.label, "sv"));
  return choices;
}

export function FieldEditSessionClient({
  mapSlug,
  mapTitle,
  sessionId,
  versionId,
  selection,
  initialOps,
}: Props) {
  const router = useRouter();
  const [tool, setTool] = useState<FieldEditTool>("delete");
  const [ops, setOps] = useState<FieldEditOps>(initialOps);
  const [hitIndex, setHitIndex] = useState<MapHitIndexEntry[]>([]);
  const [symbolChoices, setSymbolChoices] = useState<Array<{ symNum: number; label: string }>>([]);
  const [symbolNumber, setSymbolNumber] = useState<number | "">("");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishAfter, setPublishAfter] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");
  const rootTransformRef = useRef<SvgRootTransform>(IDENTITY_SVG_TRANSFORM);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch(`/api/maps/${mapSlug}/versions/${versionId}/map-hit-index?objectIndex=1`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.index)) setHitIndex(data.index);
      })
      .catch(() => {});

    fetchPreviewText(`/api/maps/${mapSlug}/versions/${versionId}/preview`)
      .then((svg) => {
        const layers = parseOcadLayersFromSvg(svg);
        const choices = pointSymbolChoices(layers);
        setSymbolChoices(choices);
        if (choices[0]) setSymbolNumber(choices[0].symNum);
        void parseOcadMapScale(svg);
      })
      .catch(() => {});
  }, [mapSlug, versionId]);

  const scheduleSave = useCallback(
    (nextOps: FieldEditOps) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        setSaving(true);
        setSaveState("idle");
        const res = await fetch(`/api/maps/${mapSlug}/field-edits/${sessionId}/ops`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(nextOps),
        });
        setSaving(false);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? "Kunde inte spara ändringar");
          setSaveState("error");
          return;
        }
        setSaveState("saved");
        setError(null);
      }, 600);
    },
    [mapSlug, sessionId],
  );

  const updateOps = useCallback(
    (updater: (current: FieldEditOps) => FieldEditOps) => {
      setOps((current) => {
        const next = updater(current);
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, svg: SVGSVGElement) => {
      const pt = screenToSvgPoint(svg, e.clientX, e.clientY);
      if (!pt) return;
      const geo = svgUserToGeoPoint(pt, rootTransformRef.current);

      if (tool === "delete") {
        const hit = findNearestMapFeature(hitIndex, geo, 15);
        if (!hit?.i) {
          setError("Inget kartobjekt hittades — zooma in och försök igen");
          return;
        }
        updateOps((current) => {
          const deletes = current.deletes.includes(hit.i!)
            ? current.deletes.filter((id) => id !== hit.i)
            : [...current.deletes, hit.i!];
          return { ...current, deletes };
        });
        setError(null);
        return;
      }

      if (tool === "addPoint") {
        if (symbolNumber === "") {
          setError("Välj en punkt-symbol först");
          return;
        }
        updateOps((current) => ({
          ...current,
          adds: [
            ...current.adds,
            { x: geo[0], y: geo[1], symbolNumber: Number(symbolNumber) },
          ],
        }));
        setError(null);
      }
    },
    [hitIndex, symbolNumber, tool, updateOps],
  );

  const drawPointerHandlers = useMemo<MapDrawPointerHandlers>(
    () => ({
      onPointerDown: handlePointerDown,
      onPointerMove: () => {},
      onPointerUp: () => {},
    }),
    [handlePointerDown],
  );

  const renderSvgOverlay = useCallback(
    (transform: SvgRootTransform) => {
      rootTransformRef.current = transform;
      return (
        <g
          dangerouslySetInnerHTML={{
            __html:
              selectionOverlaySvg(selection.geometry, transform) +
              opsOverlaySvg(ops, transform, hitIndex),
          }}
        />
      );
    },
    [selection.geometry, ops, hitIndex],
  );

  async function handlePublish() {
    if (ops.deletes.length === 0 && ops.adds.length === 0) {
      setError("Gör minst en ändring innan du publicerar");
      return;
    }
    setPublishing(true);
    setError(null);
    const res = await fetch(`/api/maps/${mapSlug}/field-edits/${sessionId}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publish: publishAfter }),
    });
    setPublishing(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Publicering misslyckades");
      return;
    }
    const data = await res.json();
    router.push(`/maps/${mapSlug}?published=v${data.versionNumber}`);
    router.refresh();
  }

  async function handleCancel() {
    if (!confirm("Avbryt fältredigeringen? Osparade ändringar försvinner.")) return;
    const res = await fetch(`/api/maps/${mapSlug}/field-edits/${sessionId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Kunde inte avbryta");
      return;
    }
    router.push(`/maps/${mapSlug}`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTool("delete")}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              tool === "delete"
                ? "bg-red-600 text-white"
                : "border border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
          >
            Radera objekt
          </button>
          <button
            type="button"
            onClick={() => setTool("addPoint")}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              tool === "addPoint"
                ? "bg-emerald-600 text-white"
                : "border border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
          >
            Lägg punkt
          </button>
        </div>

        {tool === "addPoint" && (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-slate-600">Symbol</span>
            <select
              value={symbolNumber}
              onChange={(e) => setSymbolNumber(Number(e.target.value))}
              className="form-select min-w-[180px]"
            >
              {symbolChoices.length === 0 ? (
                <option value="">Laddar symboler…</option>
              ) : (
                symbolChoices.map((choice) => (
                  <option key={choice.symNum} value={choice.symNum}>
                    {choice.label}
                  </option>
                ))
              )}
            </select>
          </label>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-3 text-sm text-slate-600">
          <span>
            {ops.deletes.length} raderade · {ops.adds.length} nya punkter
          </span>
          {saving ? (
            <span>Sparar…</span>
          ) : saveState === "saved" ? (
            <span className="text-emerald-700">Sparat</span>
          ) : null}
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <DiffMapPanel
        previewUrl={`/api/maps/${mapSlug}/versions/${versionId}/preview`}
        title={mapTitle}
        mapSlug={mapSlug}
        versionId={versionId}
        exportEnabled={false}
        interactionMode="draw"
        drawPointerHandlers={drawPointerHandlers}
        renderSvgOverlay={renderSvgOverlay}
      />

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={publishAfter}
            onChange={(e) => setPublishAfter(e.target.checked)}
          />
          Publicera ny version direkt
        </label>
        <button
          type="button"
          disabled={publishing}
          onClick={handlePublish}
          className="rounded-lg bg-ifk-blue px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {publishing ? "Publicerar…" : "Publicera ändringar"}
        </button>
        <button
          type="button"
          disabled={publishing}
          onClick={handleCancel}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Avbryt
        </button>
        <p className="w-full text-xs text-slate-500">
          Fältredigering skapar en ny kartversion direkt — utan OCAD-fil eller incheckning. Området
          är låst tills du publicerar eller avbryter.
        </p>
      </div>
    </div>
  );
}
