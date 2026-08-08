"use client";

import type {
  ExportFormat,
  ExportOrientation,
  ExportOutputFormat,
  ExportScale,
  ExportSettings,
} from "@/lib/ocad/map-export";
import {
  EXPORT_FORMATS,
  EXPORT_ORIENTATIONS,
  EXPORT_SCALES,
  formatExportLabel,
} from "@/lib/ocad/map-export";
import { OCAD_EXPORT_VERSIONS, type OcadExportVersion } from "@/lib/ocad/ocad-export-shared";
import { HelpLinkIcon } from "@/components/help-link-icon";

type Props = {
  settings: ExportSettings;
  onChange: (settings: ExportSettings) => void;
  onExport: () => void;
  onCancel: () => void;
  exporting: boolean;
  error: string | null;
  /** When set, shows checkbox to include kartförslag in PDF/GeoTIFF (count may be unknown until export). */
  suggestionOverlayCount?: number;
};

export function MapExportControls({
  settings,
  onChange,
  onExport,
  onCancel,
  exporting,
  error,
  suggestionOverlayCount,
}: Props) {
  const showSuggestionOption =
    settings.outputFormat === "pdf" ||
    settings.outputFormat === "geotiff" ||
    settings.outputFormat === "ocd";
  const exportButtonLabel =
    settings.outputFormat === "ocd"
      ? exporting
        ? "Exporterar…"
        : "Ladda ner OCD"
      : settings.outputFormat === "geotiff"
        ? exporting
          ? "Exporterar…"
          : "Ladda ner GeoTIFF"
        : exporting
          ? "Exporterar…"
          : "Ladda ner PDF";

  return (
    <div className="border-b border-slate-200 bg-ifk-blue-muted px-4 py-3">
      <div className="mb-3 flex min-w-0 items-center gap-2">
        <p className="text-sm font-medium text-slate-900">Exportera utsnitt</p>
        <HelpLinkIcon section="kartvy" />
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <p className="mb-1 text-xs text-slate-500">Filtyp</p>
          <select
            value={settings.outputFormat}
            onChange={(e) =>
              onChange({
                ...settings,
                outputFormat: e.target.value as ExportOutputFormat,
              })
            }
            className="form-select min-w-[120px]"
          >
            <option value="pdf">PDF</option>
            <option value="ocd">OCAD (.ocd)</option>
            <option value="geotiff">GeoTIFF (.tif)</option>
          </select>
        </div>

        {settings.outputFormat === "ocd" && (
          <div>
            <p className="mb-1 text-xs text-slate-500">OCAD-version</p>
            <select
              value={settings.ocadVersion}
              onChange={(e) =>
                onChange({
                  ...settings,
                  ocadVersion: Number(e.target.value) as OcadExportVersion,
                })
              }
              className="form-select min-w-[140px]"
            >
              {OCAD_EXPORT_VERSIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <p className="mb-1 text-xs text-slate-500">Skala</p>
          <select
            value={settings.scale}
            onChange={(e) =>
              onChange({ ...settings, scale: Number(e.target.value) as ExportScale })
            }
            className="form-select min-w-[120px]"
          >
            {EXPORT_SCALES.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <p className="mb-1 text-xs text-slate-500">Format</p>
          <select
            value={settings.format}
            onChange={(e) =>
              onChange({ ...settings, format: e.target.value as ExportFormat })
            }
            className="form-select min-w-[100px]"
          >
            {EXPORT_FORMATS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <p className="mb-1 text-xs text-slate-500">Orientering</p>
          <select
            value={settings.orientation}
            onChange={(e) =>
              onChange({
                ...settings,
                orientation: e.target.value as ExportOrientation,
              })
            }
            className="form-select min-w-[120px]"
          >
            {EXPORT_ORIENTATIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <p className="text-xs text-slate-400">{formatExportLabel(settings)}</p>

        {showSuggestionOption && (
          <label className="flex cursor-pointer items-center gap-2 self-end pb-1 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={settings.includeSuggestions}
              onChange={(e) =>
                onChange({ ...settings, includeSuggestions: e.target.checked })
              }
              className="rounded border-slate-300"
            />
            Inkludera kartförslag
            {suggestionOverlayCount != null && suggestionOverlayCount > 0 && (
              <span className="text-xs text-slate-400">({suggestionOverlayCount})</span>
            )}
          </label>
        )}

        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={exporting}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:border-slate-400 hover:bg-white disabled:opacity-50"
          >
            Avbryt
          </button>
          <button
            type="button"
            onClick={onExport}
            disabled={exporting}
            className="btn-primary px-3 py-1.5"
          >
            {exportButtonLabel}
          </button>
        </div>
      </div>

      <p className="mt-2 text-xs text-slate-500">
        Dra ramen på kartan till önskat utsnitt innan du exporterar.
        {settings.outputFormat === "ocd" &&
          (settings.includeSuggestions
            ? " OCD-exporten sparar objekt inom ramen. Med «Inkludera kartförslag» läggs markeringar till som OCAD-objekt — du väljer symbol/lager i dialogen (OCAD 12/2018)."
            : " OCD-exporten sparar objekt inom ramen och behåller symboler och inställningar från originalfilen.")}
        {settings.outputFormat === "geotiff" &&
          " GeoTIFF sparas med kartans projicerade koordinatsystem (EPSG) för det valda utsnittet."}
        {showSuggestionOption &&
          settings.includeSuggestions &&
          " Öppna och pågående kartförslag för versionen ritas ovanpå kartan i exporten."}
      </p>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export type { ExportSettings };
