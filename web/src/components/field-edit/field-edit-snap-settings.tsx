"use client";

import type { FieldEditEditorSettings } from "@/lib/field-edit/editor-settings";

type Props = {
  settings: FieldEditEditorSettings;
  onChange: (settings: FieldEditEditorSettings) => void;
};

export function FieldEditSnapSettings({ settings, onChange }: Props) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm sm:flex-row sm:flex-wrap sm:items-center">
      <label className="flex min-h-11 items-center gap-3 font-medium text-slate-700">
        <input
          type="checkbox"
          checked={settings.snapEnabled}
          onChange={(e) => onChange({ ...settings, snapEnabled: e.target.checked })}
          className="h-5 w-5"
        />
        Snappa mot samma symbol
      </label>
      <label className="flex min-h-11 items-center gap-2 text-slate-600">
        Tolerans
        <input
          type="number"
          min={0.1}
          max={20}
          step={0.1}
          disabled={!settings.snapEnabled}
          value={settings.snapToleranceM}
          onChange={(e) => {
            const value = Number(e.target.value);
            if (!Number.isFinite(value) || value <= 0) return;
            onChange({ ...settings, snapToleranceM: value });
          }}
          className="w-20 rounded border border-slate-300 px-2 py-2 text-sm disabled:opacity-50 sm:py-1"
        />
        m
      </label>
      <label className="flex min-h-11 items-center gap-2 text-slate-600">
        Frihandsutjämning
        <select
          value={settings.freehandSmoothingFactor}
          onChange={(e) => {
            const value = Number(e.target.value);
            if (value !== 1 && value !== 2 && value !== 3) return;
            onChange({ ...settings, freehandSmoothingFactor: value });
          }}
          className="rounded border border-slate-300 px-2 py-2 text-sm sm:py-1"
          title="Högre värde ger färre brytpunkter (OCAD 1–3)"
        >
          <option value={1}>1 (minst)</option>
          <option value={2}>2</option>
          <option value={3}>3 (mest)</option>
        </select>
      </label>
    </div>
  );
}
