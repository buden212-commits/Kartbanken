"use client";

import { MapTypeIcon } from "@/components/map-type-icon";
import {
  AREA_TYPE_LABELS,
  AREA_TYPE_ORDER,
  type AreaType,
} from "@/lib/maps/area-types";

type Props = {
  id?: string;
  value: AreaType;
  onChange: (next: AreaType) => void;
  disabled?: boolean;
  label?: string;
};

export function AreaTypePicker({
  id = "area-type",
  value,
  onChange,
  disabled = false,
  label = "Typ *",
}: Props) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="form-label">
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as AreaType)}
        className="form-select"
      >
        {AREA_TYPE_ORDER.map((type) => (
          <option key={type} value={type}>
            {AREA_TYPE_LABELS[type]}
          </option>
        ))}
      </select>
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Förhandsvisning av typikon">
        {AREA_TYPE_ORDER.map((type) => {
          const selected = type === value;
          return (
            <button
              key={type}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              onClick={() => onChange(type)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ifk-blue/30 disabled:opacity-50 ${
                selected
                  ? "border-ifk-blue bg-ifk-blue-pale text-ifk-blue"
                  : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
              }`}
            >
              <MapTypeIcon areaType={type} className="h-5 w-5 shrink-0" />
              <span>{AREA_TYPE_LABELS[type]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
