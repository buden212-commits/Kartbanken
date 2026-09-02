"use client";

import type { FieldEditEditorSettings } from "@/lib/field-edit/editor-settings";
import {
  bezierSmoothPolyline,
  smoothPolylineChaikin,
  simplifyPolyline,
} from "@/lib/field-edit/geometry-tools";
import type { FieldEditObjectEntry } from "@/lib/field-edit/object-index";
import { resolveObjectCoordinates } from "@/lib/field-edit/types";
import type { FieldEditOps } from "@/lib/field-edit/types";
import { verticesForHandles } from "@/lib/field-edit/vertices";

type Props = {
  selectedObject: FieldEditObjectEntry;
  ops: FieldEditOps;
  mapScale: number;
  editorSettings: FieldEditEditorSettings;
  onEditorSettingsChange: (settings: FieldEditEditorSettings) => void;
  onApplyCoordinates: (coordinates: [number, number][]) => void;
  onMessage: (message: string | null) => void;
};

export function FieldEditCadPanel({
  selectedObject,
  ops,
  mapScale,
  editorSettings,
  onEditorSettingsChange,
  onApplyCoordinates,
  onMessage,
}: Props) {
  if (selectedObject.t !== "line" && selectedObject.t !== "area") {
    return null;
  }

  const rawCoords =
    resolveObjectCoordinates(selectedObject.i, selectedObject.v, ops) ?? selectedObject.v;
  const editCoords =
    selectedObject.t === "area"
      ? verticesForHandles(rawCoords, selectedObject.t)
      : rawCoords;
  const minPoints = selectedObject.t === "line" ? 2 : 3;
  const kindLabel = selectedObject.t === "line" ? "linje" : "yta";

  function applyTool(
    label: string,
    next: [number, number][],
    beforeCount: number,
    afterCount: number,
  ) {
    if (afterCount < minPoints) {
      onMessage(`${label} gav för få punkter — behåller minst ${minPoints}.`);
      return;
    }
    onApplyCoordinates(next);
    onMessage(
      `${label}: ${beforeCount} → ${afterCount} brytpunkter.`,
    );
  }

  return (
    <div className="rounded-xl border border-ifk-blue/20 bg-ifk-blue/5 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">
          CAD-verktyg — vald {kindLabel} ({editCoords.length} brytpunkter)
        </h3>
        <span className="text-xs text-slate-500">Symbol {selectedObject.s}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          Förenkla-tolerans
          <input
            type="number"
            min={0.1}
            max={20}
            step={0.1}
            value={editorSettings.simplifyToleranceM}
            onChange={(e) => {
              const value = Number(e.target.value);
              if (!Number.isFinite(value) || value <= 0) return;
              onEditorSettingsChange({ ...editorSettings, simplifyToleranceM: value });
            }}
            className="w-16 rounded border border-slate-300 px-2 py-1 text-sm"
          />
          m
        </label>

        <button
          type="button"
          onClick={() => {
            const result = simplifyPolyline(
              editCoords,
              editorSettings.simplifyToleranceM,
              mapScale,
              minPoints,
            );
            applyTool("Förenkla", result.coordinates, result.beforeCount, result.afterCount);
          }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          Förenkla
        </button>

        <button
          type="button"
          onClick={() => {
            const result = smoothPolylineChaikin(editCoords, 2, minPoints);
            applyTool("Mjuka hörn", result.coordinates, result.beforeCount, result.afterCount);
          }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          Mjuka hörn
        </button>

        <button
          type="button"
          onClick={() => {
            const result = bezierSmoothPolyline(editCoords, 8, minPoints);
            applyTool("Bézier-kurva", result.coordinates, result.beforeCount, result.afterCount);
          }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          Bézier-kurva
        </button>
      </div>

      <p className="text-xs text-slate-600">
        Förenkla tar bort onödiga brytpunkter inom toleransen. Mjuka hörn rundar av vinklar.
        Bézier-kurva ersätter raka segment med mjuka kurvor (sparas som förenklad polylinje i OCAD).
      </p>
    </div>
  );
}
