"use client";

import type { FieldEditEditorSettings } from "@/lib/field-edit/editor-settings";

type Props = {
  settings: FieldEditEditorSettings;
  onChange: (settings: FieldEditEditorSettings) => void;
};

export function FieldEditSnapSettings({ settings, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
      <label className="flex items-center gap-2 font-medium text-slate-700">
        <input
          type="checkbox"
          checked={settings.snapEnabled}
          onChange={(e) => onChange({ ...settings, snapEnabled: e.target.checked })}
        />
        Snappa mot objekt
      </label>
      <label className="flex items-center gap-2 text-slate-600">
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
          className="w-16 rounded border border-slate-300 px-2 py-1 text-sm disabled:opacity-50"
        />
        m
      </label>
    </div>
  );
}
