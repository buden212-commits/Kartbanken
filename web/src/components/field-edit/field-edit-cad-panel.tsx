"use client";

import { FieldEditSymbolPicker, type SymbolGroups } from "@/components/field-edit/field-edit-symbol-picker";
import {
  CadAddVertexIcon,
  CadBezierIcon,
  CadDuplicateIcon,
  CadMeasureIcon,
  CadRemoveVertexIcon,
  CadReverseIcon,
  CadSimplifyIcon,
  CadSmoothCornersIcon,
  MapChangeSymbolToolIcon,
  MapTrashToolIcon,
} from "@/components/map-draw-tool-icons";
import type { FieldEditFavoriteSymbols } from "@/lib/field-edit/favorites";
import type { FieldEditEditorSettings } from "@/lib/field-edit/editor-settings";
import {
  smoothPolylineChaikin,
  simplifyPolyline,
} from "@/lib/field-edit/geometry-tools";
import type { FieldEditObjectEntry } from "@/lib/field-edit/object-index";
import { geometryKindFromType } from "@/lib/field-edit/hit-test";
import { resolveObjectCoordinates } from "@/lib/field-edit/types";
import type { FieldEditOps } from "@/lib/field-edit/types";
import { reverseVertices, verticesForHandles } from "@/lib/field-edit/vertices";
import { mapUnitsToMeters } from "@/lib/ocad/crs";
import { formatOcadSymbolNumber } from "@/lib/ocad/layers";
import { distance2d } from "@/lib/field-edit/polyline-geometry";
import { useRef, useState } from "react";

export type CadVertexTool = "off" | "remove" | "add";

type Props = {
  selectedObject: FieldEditObjectEntry;
  ops: FieldEditOps;
  mapScale: number;
  editorSettings: FieldEditEditorSettings;
  onEditorSettingsChange: (settings: FieldEditEditorSettings) => void;
  onApplyCoordinates: (coordinates: [number, number][]) => void;
  onChangeSymbol: (symbolNumber: number) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMessage: (message: string | null) => void;
  symbolGroups: SymbolGroups;
  favorites?: FieldEditFavoriteSymbols;
  onToggleFavorite?: (symNum: number) => void;
  bezierActive: boolean;
  onStartBezier: () => void;
  onApplyBezier: () => void;
  onCancelBezier: () => void;
  vertexTool: CadVertexTool;
  onVertexToolChange: (tool: CadVertexTool) => void;
};

const LONG_PRESS_MS = 480;

const iconBtn =
  "group relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ifk-blue/30 disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 sm:w-10";
const iconInactive =
  "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50";
const iconActive = "border-ifk-blue bg-ifk-blue text-white";
const iconActiveAdd = "border-emerald-600 bg-emerald-600 text-white";
const iconDanger =
  "border-slate-200 bg-white text-red-600 hover:border-red-200 hover:bg-red-50";
const iconDangerActive = "border-red-600 bg-red-600 text-white";

function CadIconButton({
  label,
  active,
  activeClass = iconActive,
  inactiveClass = iconInactive,
  disabled,
  onClick,
  onLongPress,
  badge,
  children,
}: {
  label: string;
  active?: boolean;
  activeClass?: string;
  inactiveClass?: string;
  disabled?: boolean;
  onClick: () => void;
  onLongPress?: () => void;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressedRef = useRef(false);

  function clearTimer() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  return (
    <button
      type="button"
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={() => {
        if (longPressedRef.current) {
          longPressedRef.current = false;
          return;
        }
        onClick();
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (!onLongPress || disabled) return;
        longPressedRef.current = false;
        clearTimer();
        timerRef.current = setTimeout(() => {
          longPressedRef.current = true;
          timerRef.current = null;
          onLongPress();
        }, LONG_PRESS_MS);
      }}
      onPointerUp={clearTimer}
      onPointerLeave={clearTimer}
      onPointerCancel={clearTimer}
      className={`${iconBtn} ${active ? activeClass : inactiveClass}`}
    >
      {children}
      {badge}
    </button>
  );
}

function polylineLengthM(coords: [number, number][], mapScale: number): number {
  let sum = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    sum += mapUnitsToMeters(distance2d(coords[i]!, coords[i + 1]!), mapScale);
  }
  return sum;
}

function polygonAreaM2(ring: [number, number][], mapScale: number): number {
  if (ring.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[i + 1]!;
    sum += x1 * y2 - x2 * y1;
  }
  const areaMap = Math.abs(sum) / 2;
  const mPerUnit = mapUnitsToMeters(1, mapScale);
  return areaMap * mPerUnit * mPerUnit;
}

export function FieldEditCadPanel({
  selectedObject,
  ops,
  mapScale,
  editorSettings,
  onEditorSettingsChange,
  onApplyCoordinates,
  onChangeSymbol,
  onDelete,
  onDuplicate,
  onMessage,
  symbolGroups,
  favorites,
  onToggleFavorite,
  bezierActive,
  onStartBezier,
  onApplyBezier,
  onCancelBezier,
  vertexTool,
  onVertexToolChange,
}: Props) {
  const [showSymbolPicker, setShowSymbolPicker] = useState(false);
  const kind = geometryKindFromType(selectedObject.t);
  const currentModify = ops.modifies.find((m) => m.objectIndex === selectedObject.i);
  const currentSymbol = currentModify?.symbolNumber ?? selectedObject.s;
  const isLineOrArea = selectedObject.t === "line" || selectedObject.t === "area";

  const rawCoords =
    resolveObjectCoordinates(selectedObject.i, selectedObject.v, ops) ?? selectedObject.v;
  const editCoords =
    selectedObject.t === "area"
      ? verticesForHandles(rawCoords, selectedObject.t)
      : rawCoords;
  const minPoints = selectedObject.t === "line" ? 2 : 3;
  const kindLabel =
    selectedObject.t === "line" ? "linje" : selectedObject.t === "area" ? "yta" : "punkt";

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
    onMessage(`${label}: ${beforeCount} → ${afterCount} brytpunkter.`);
  }

  function toggleVertexTool() {
    if (vertexTool === "off" || vertexTool === "add") {
      onVertexToolChange("remove");
      onMessage("Radera brytpunkt: klicka på den brytpunkt du vill ta bort. Håll inne för att lägga till.");
    } else {
      onVertexToolChange("off");
      onMessage(null);
    }
  }

  function longPressVertexTool() {
    if (vertexTool === "add") {
      onVertexToolChange("remove");
      onMessage("Radera brytpunkt: klicka på brytpunkten. Håll inne för att lägga till.");
    } else {
      onVertexToolChange("add");
      onMessage("Lägg till brytpunkt: klicka på linjen där punkten ska sitta. Håll inne för att radera.");
    }
  }

  return (
    <div className="rounded-xl border border-ifk-blue/20 bg-ifk-blue/5 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">
          {isLineOrArea
            ? `CAD — vald ${kindLabel} (${editCoords.length} brytpunkter)`
            : `CAD — vald ${kindLabel}`}
        </h3>
        <span className="text-xs text-slate-500">
          Symbol {formatOcadSymbolNumber(currentSymbol)}
        </span>
      </div>

      <div
        className="flex flex-wrap items-center gap-1.5"
        role="toolbar"
        aria-label="CAD-verktyg"
      >
        <CadIconButton
          label="Byt symbol"
          active={showSymbolPicker}
          disabled={bezierActive}
          onClick={() => {
            onVertexToolChange("off");
            setShowSymbolPicker((v) => !v);
          }}
        >
          <MapChangeSymbolToolIcon />
        </CadIconButton>

        <CadIconButton
          label="Radera objekt"
          disabled={bezierActive}
          inactiveClass={iconDanger}
          onClick={() => {
            if (!confirm("Radera valt objekt?")) return;
            onDelete();
          }}
        >
          <MapTrashToolIcon />
        </CadIconButton>

        <CadIconButton
          label="Duplicera objekt"
          disabled={bezierActive}
          onClick={() => {
            onVertexToolChange("off");
            onDuplicate();
          }}
        >
          <CadDuplicateIcon />
        </CadIconButton>

        <CadIconButton
          label="Mät längd/yta"
          disabled={bezierActive}
          onClick={() => {
            onVertexToolChange("off");
            if (selectedObject.t === "line") {
              const len = polylineLengthM(editCoords, mapScale);
              onMessage(`Längd: ${len.toFixed(1)} m`);
            } else if (selectedObject.t === "area") {
              const area = polygonAreaM2(
                editCoords.length >= 2 &&
                  editCoords[0]![0] === editCoords[editCoords.length - 1]![0] &&
                  editCoords[0]![1] === editCoords[editCoords.length - 1]![1]
                  ? editCoords
                  : [...editCoords, editCoords[0]!],
                mapScale,
              );
              onMessage(`Yta: ${area.toFixed(0)} m² (${(area / 1e6).toFixed(3)} km²)`);
            } else {
              onMessage("Mätning gäller linjer och ytor.");
            }
          }}
        >
          <CadMeasureIcon />
        </CadIconButton>

        {isLineOrArea && (
          <>
            <CadIconButton
              label={
                vertexTool === "add"
                  ? "Lägg till brytpunkt (håll inne för radera)"
                  : "Radera brytpunkt (håll inne för lägg till)"
              }
              active={vertexTool !== "off"}
              activeClass={vertexTool === "add" ? iconActiveAdd : iconDangerActive}
              disabled={bezierActive}
              onClick={toggleVertexTool}
              onLongPress={longPressVertexTool}
              badge={
                vertexTool === "add" ? (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute bottom-0.5 right-0.5 text-[10px] font-bold leading-none text-white"
                    style={{
                      textShadow: "0 0 2px rgba(0,0,0,0.85), 0 1px 2px rgba(0,0,0,0.7)",
                    }}
                  >
                    +
                  </span>
                ) : null
              }
            >
              {vertexTool === "add" ? <CadAddVertexIcon /> : <CadRemoveVertexIcon />}
            </CadIconButton>

            <CadIconButton
              label="Vänd riktning"
              disabled={bezierActive}
              onClick={() => {
                onVertexToolChange("off");
                const next = reverseVertices(rawCoords, selectedObject.t);
                onApplyCoordinates(next);
                onMessage("Riktning vänd.");
              }}
            >
              <CadReverseIcon />
            </CadIconButton>

            <span className="mx-0.5 hidden h-8 w-px bg-slate-200 sm:inline-block" aria-hidden />

            <label
              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600"
              title="Buffert för förenkla (± meter)"
            >
              ±
              <input
                type="number"
                min={0.1}
                max={20}
                step={0.1}
                disabled={bezierActive}
                value={editorSettings.simplifyToleranceM}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  if (!Number.isFinite(value) || value <= 0) return;
                  onEditorSettingsChange({ ...editorSettings, simplifyToleranceM: value });
                }}
                className="w-12 rounded border border-slate-200 px-1 py-0.5 text-sm disabled:opacity-50"
              />
              m
            </label>

            <CadIconButton
              label="Förenkla (buffert)"
              disabled={bezierActive}
              onClick={() => {
                onVertexToolChange("off");
                const result = simplifyPolyline(
                  editCoords,
                  editorSettings.simplifyToleranceM,
                  mapScale,
                  minPoints,
                );
                applyTool("Förenkla", result.coordinates, result.beforeCount, result.afterCount);
              }}
            >
              <CadSimplifyIcon />
            </CadIconButton>

            <CadIconButton
              label="Mjuka hörn"
              disabled={bezierActive}
              onClick={() => {
                onVertexToolChange("off");
                const result = smoothPolylineChaikin(editCoords, 2, minPoints);
                applyTool("Mjuka hörn", result.coordinates, result.beforeCount, result.afterCount);
              }}
            >
              <CadSmoothCornersIcon />
            </CadIconButton>

            <CadIconButton
              label="Bézier-kurva"
              active={bezierActive}
              activeClass="border-orange-600 bg-orange-600 text-white"
              inactiveClass="border-orange-200 bg-white text-orange-800 hover:border-orange-300 hover:bg-orange-50"
              disabled={editCoords.length < 2 && !bezierActive}
              onClick={() => {
                onVertexToolChange("off");
                if (bezierActive) return;
                onStartBezier();
              }}
            >
              <CadBezierIcon />
            </CadIconButton>
          </>
        )}
      </div>

      {showSymbolPicker && !bezierActive && (
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <FieldEditSymbolPicker
            groups={symbolGroups}
            kind={kind}
            value={currentSymbol}
            onChange={(symNum) => {
              onChangeSymbol(symNum);
              setShowSymbolPicker(false);
              onMessage(`Symbol bytt till ${formatOcadSymbolNumber(symNum)}.`);
            }}
            favorites={favorites}
            onToggleFavorite={onToggleFavorite ? (sym) => onToggleFavorite(sym) : undefined}
          />
        </div>
      )}

      {bezierActive && (
        <div className="space-y-2 rounded-lg border border-orange-200 bg-orange-50/80 p-3">
          <p className="text-sm font-medium text-orange-950">
            Bézier-läge — dra i de orangefärgade kontrollpunkterna (P1/P2).
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onApplyBezier}
              className="min-h-11 flex-1 rounded-lg bg-orange-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-orange-700 sm:min-h-0 sm:flex-none sm:py-2"
            >
              Tillämpa kurva
            </button>
            <button
              type="button"
              onClick={onCancelBezier}
              className="min-h-11 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 sm:min-h-0 sm:flex-none sm:py-2"
            >
              Avbryt
            </button>
          </div>
        </div>
      )}

      {!bezierActive && vertexTool !== "off" && isLineOrArea && (
        <p className="text-xs text-slate-600">
          {vertexTool === "remove"
            ? "Klicka en brytpunkt för att radera den. Håll inne ikonen för att växla till lägg till."
            : "Klicka på linjen/kanten för att lägga till en brytpunkt. Håll inne ikonen för att växla till radera."}
        </p>
      )}
    </div>
  );
}
