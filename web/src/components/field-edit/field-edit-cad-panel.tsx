"use client";

import { FieldEditSymbolPicker, type SymbolGroups } from "@/components/field-edit/field-edit-symbol-picker";
import {
  CadAddCornerVertexIcon,
  CadAddDashVertexIcon,
  CadAddNormalVertexIcon,
  CadBezierIcon,
  CadCutAreaIcon,
  CadCutHoleIcon,
  CadCutLineIcon,
  CadFillOrBorderIcon,
  CadMergeIcon,
  CadMeasureIcon,
  CadRemoveVertexIcon,
  CadReverseIcon,
  CadSimplifyIcon,
  CadSmoothCornersIcon,
  CadToggleVertexTypeIcon,
  MapChangeSymbolToolIcon,
  MapTrashToolIcon,
} from "@/components/map-draw-tool-icons";
import type { FieldEditFavoriteSymbols } from "@/lib/field-edit/favorites";
import type { FieldEditEditorSettings } from "@/lib/field-edit/editor-settings";
import {
  findSymbolKind,
  planFillOrBorderOrDuplicate,
} from "@/lib/field-edit/fill-or-border";
import {
  smoothPolylineChaikin,
  simplifyPolyline,
} from "@/lib/field-edit/geometry-tools";
import type { FieldEditObjectEntry } from "@/lib/field-edit/object-index";
import { geometryKindFromType } from "@/lib/field-edit/hit-test";
import { distance2d } from "@/lib/field-edit/polyline-geometry";
import {
  defaultVertexKinds,
  resolveObjectCoordinates,
  resolveObjectHoles,
  resolveObjectVertexKinds,
  vertexKindsForStoredCoordinates,
  type FieldEditGeometryKind,
  type FieldEditOps,
  type FieldEditVertexKind,
} from "@/lib/field-edit/types";
import { reverseVertices, verticesForHandles } from "@/lib/field-edit/vertices";
import { mapUnitsToMeters, metersToMapUnits } from "@/lib/ocad/crs";
import { formatOcadSymbolNumber } from "@/lib/ocad/layers";
import { useMemo, useRef, useState } from "react";

export type CadVertexTool =
  | "off"
  | "remove"
  | "addNormal"
  | "addCorner"
  | "addDash"
  | "toggleType";

export type CadCutTool = "off" | "cutLine" | "cutArea" | "cutHole";

type Props = {
  selectedObject: FieldEditObjectEntry;
  ops: FieldEditOps;
  mapScale: number;
  editorSettings: FieldEditEditorSettings;
  onEditorSettingsChange: (settings: FieldEditEditorSettings) => void;
  onApplyCoordinates: (
    coordinates: [number, number][],
    vertexKinds?: FieldEditVertexKind[],
  ) => void;
  onChangeSymbol: (symbolNumber: number) => void;
  onDelete: () => void;
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
  cutTool: CadCutTool;
  onCutToolChange: (tool: CadCutTool) => void;
  cutDraftPoints: [number, number][];
  onFinishCut: () => void;
  onCancelCut: () => void;
  mergeActive: boolean;
  mergeCount: number;
  canApplyMerge: boolean;
  onToggleMerge: () => void;
  onApplyMerge: () => void;
  onCancelMerge: () => void;
  onFillOrBorder: (args: {
    targetSymbol: number;
    targetKind: FieldEditGeometryKind;
    useHoles: boolean;
  }) => void;
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
  children,
}: {
  label: string;
  active?: boolean;
  activeClass?: string;
  inactiveClass?: string;
  disabled?: boolean;
  onClick: () => void;
  onLongPress?: () => void;
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

function selectVertexTool(
  current: CadVertexTool,
  next: CadVertexTool,
): CadVertexTool {
  return current === next ? "off" : next;
}

function selectCutTool(current: CadCutTool, next: CadCutTool): CadCutTool {
  return current === next ? "off" : next;
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
  cutTool,
  onCutToolChange,
  cutDraftPoints,
  onFinishCut,
  onCancelCut,
  mergeActive,
  mergeCount,
  canApplyMerge,
  onToggleMerge,
  onApplyMerge,
  onCancelMerge,
  onFillOrBorder,
}: Props) {
  const [showSymbolPicker, setShowSymbolPicker] = useState(false);
  const [fillBorderOpen, setFillBorderOpen] = useState(false);
  const [fillTargetKind, setFillTargetKind] = useState<FieldEditGeometryKind>(() =>
    geometryKindFromType(selectedObject.t) === "point"
      ? "point"
      : geometryKindFromType(selectedObject.t) === "area"
        ? "area"
        : "line",
  );
  const [fillTargetSymbol, setFillTargetSymbol] = useState<number | "">("");
  const [fillUseHoles, setFillUseHoles] = useState(false);
  const kind = geometryKindFromType(selectedObject.t);
  const currentModify = ops.modifies.find((m) => m.objectIndex === selectedObject.i);
  const currentSymbol = currentModify?.symbolNumber ?? selectedObject.s;
  const isLineOrArea = selectedObject.t === "line" || selectedObject.t === "area";
  const cutActive = cutTool !== "off";
  const editLocked = bezierActive || cutActive || mergeActive || fillBorderOpen;

  const rawCoords =
    resolveObjectCoordinates(selectedObject.i, selectedObject.v, ops) ?? selectedObject.v;
  const editCoords =
    selectedObject.t === "area"
      ? verticesForHandles(rawCoords, selectedObject.t)
      : rawCoords;
  const objectHoles = resolveObjectHoles(selectedObject.i, ops);
  const vertexKinds = resolveObjectVertexKinds(
    selectedObject.i,
    editCoords.length,
    ops,
  );
  const minPoints = selectedObject.t === "line" ? 2 : 3;
  const kindLabel =
    selectedObject.t === "line" ? "linje" : selectedObject.t === "area" ? "yta" : "punkt";

  const fillPlan = useMemo(() => {
    if (!fillBorderOpen || fillTargetSymbol === "") return null;
    const targetKind =
      findSymbolKind(symbolGroups, fillTargetSymbol) ?? fillTargetKind;
    return planFillOrBorderOrDuplicate({
      objectType: selectedObject.t,
      objectSymbol: currentSymbol,
      coordinates: rawCoords.map(([x, y]) => [x, y] as [number, number]),
      holes: objectHoles,
      bbox: selectedObject.b,
      targetSymbol: fillTargetSymbol,
      targetKind,
      bboxPadMapUnits: metersToMapUnits(2, mapScale),
      useHoles: fillUseHoles,
    });
  }, [
    currentSymbol,
    fillBorderOpen,
    fillTargetKind,
    fillTargetSymbol,
    fillUseHoles,
    mapScale,
    objectHoles,
    rawCoords,
    selectedObject.b,
    selectedObject.t,
    symbolGroups,
  ]);

  function openFillBorder() {
    onVertexToolChange("off");
    onCutToolChange("off");
    if (mergeActive) onCancelMerge();
    setShowSymbolPicker(false);
    const initialKind: FieldEditGeometryKind =
      kind === "area" ? "line" : kind === "line" ? "area" : "area";
    setFillTargetKind(initialKind);
    const initial =
      symbolGroups[initialKind].find((c) => c.symNum === currentSymbol)?.symNum ??
      symbolGroups[initialKind][0]?.symNum ??
      "";
    setFillTargetSymbol(initial);
    setFillUseHoles(false);
    setFillBorderOpen(true);
    onMessage(
      "Välj symbol: samma typ = kopiera, yta+linje = kant, linje+yta = fyll.",
    );
  }

  function closeFillBorder() {
    setFillBorderOpen(false);
    setFillUseHoles(false);
    onMessage(null);
  }

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
    const stored =
      selectedObject.t === "area" ? closedRingIfNeeded(next) : next;
    const geomKind = geometryKindFromType(selectedObject.t);
    onApplyCoordinates(
      stored,
      vertexKindsForStoredCoordinates(stored, defaultVertexKinds(next.length), geomKind),
    );
    onMessage(`${label}: ${beforeCount} → ${afterCount} brytpunkter.`);
  }

  function closedRingIfNeeded(coords: [number, number][]): [number, number][] {
    if (coords.length < 3) return coords;
    const first = coords[0]!;
    const last = coords[coords.length - 1]!;
    if (first[0] === last[0] && first[1] === last[1]) return coords;
    return [...coords, [first[0], first[1]] as [number, number]];
  }

  function convertAllTo(target: FieldEditVertexKind) {
    onVertexToolChange("off");
    onCutToolChange("off");
    if (mergeActive) onCancelMerge();
    if (fillBorderOpen) closeFillBorder();
    const label =
      target === "normal" ? "normala" : target === "corner" ? "hörnbrytpunkter" : "streckbrytpunkter";
    const handleKinds = editCoords.map(() => target);
    const geomKind = geometryKindFromType(selectedObject.t);
    onApplyCoordinates(
      rawCoords,
      vertexKindsForStoredCoordinates(rawCoords, handleKinds, geomKind),
    );
    onMessage(`Alla brytpunkter ändrade till ${label}.`);
  }

  const vertexHint =
    vertexTool === "remove"
      ? "Radera brytpunkt: klicka på punkten."
      : vertexTool === "addNormal"
        ? "Lägg till normal brytpunkt: klicka på linjen."
        : vertexTool === "addCorner"
          ? "Lägg till hörnbrytpunkt: klicka på linjen."
          : vertexTool === "addDash"
            ? "Lägg till streckbrytpunkt: klicka på linjen."
            : vertexTool === "toggleType"
              ? "Växla typ: klicka på brytpunkt (normal → streck → hörn)."
              : null;

  const cutHint =
    cutTool === "cutLine"
      ? "Klipp linje: klicka för att dela, eller dra längs linjen för att klippa bort en bit."
      : cutTool === "cutArea"
        ? "Dela yta: klicka klipplinje från kant till kant, sedan «Tillämpa klipp»."
        : cutTool === "cutHole"
          ? "Klipp hål: klicka hörnen för hålet (≥3), sedan «Tillämpa klipp»."
          : null;

  const mergeHint = mergeActive
    ? selectedObject.t === "line"
      ? "Sammanfoga: klicka fler linjer med samma symbol (ändpunkter nära varandra), sedan «Tillämpa»."
      : "Sammanfoga: klicka fler ytor med samma symbol som överlappar, sedan «Tillämpa»."
    : null;

  const canFinishCut =
    (cutTool === "cutArea" && cutDraftPoints.length >= 2) ||
    (cutTool === "cutHole" && cutDraftPoints.length >= 3);

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

      <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="CAD-verktyg">
        <CadIconButton
          label="Byt symbol"
          active={showSymbolPicker}
          disabled={bezierActive || mergeActive || fillBorderOpen}
          onClick={() => {
            onVertexToolChange("off");
            onCutToolChange("off");
            if (mergeActive) onCancelMerge();
            if (fillBorderOpen) closeFillBorder();
            setShowSymbolPicker((v) => !v);
          }}
        >
          <MapChangeSymbolToolIcon />
        </CadIconButton>

        <CadIconButton
          label="Fyll / kant / duplicera"
          active={fillBorderOpen}
          activeClass="border-sky-600 bg-sky-600 text-white"
          disabled={bezierActive || cutActive || mergeActive}
          onClick={() => {
            if (fillBorderOpen) closeFillBorder();
            else openFillBorder();
          }}
        >
          <CadFillOrBorderIcon />
        </CadIconButton>

        <CadIconButton
          label="Mät längd/yta"
          disabled={bezierActive || mergeActive || fillBorderOpen}
          onClick={() => {
            onVertexToolChange("off");
            onCutToolChange("off");
            if (mergeActive) onCancelMerge();
            if (fillBorderOpen) closeFillBorder();
            if (selectedObject.t === "line") {
              onMessage(`Längd: ${polylineLengthM(editCoords, mapScale).toFixed(1)} m`);
            } else if (selectedObject.t === "area") {
              const ring =
                editCoords[0] &&
                editCoords[editCoords.length - 1] &&
                editCoords[0][0] === editCoords[editCoords.length - 1]![0] &&
                editCoords[0][1] === editCoords[editCoords.length - 1]![1]
                  ? editCoords
                  : [...editCoords, editCoords[0]!];
              const area = polygonAreaM2(ring, mapScale);
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
            <span className="mx-0.5 hidden h-8 w-px bg-slate-200 sm:inline-block" aria-hidden />

            <CadIconButton
              label="Radera brytpunkt"
              active={vertexTool === "remove"}
              activeClass={iconDangerActive}
              disabled={bezierActive || mergeActive}
              onClick={() => {
                onCutToolChange("off");
                if (mergeActive) onCancelMerge();
                const next = selectVertexTool(vertexTool, "remove");
                onVertexToolChange(next);
                onMessage(
                  next === "remove"
                    ? "Radera brytpunkt: klicka på punkten."
                    : null,
                );
              }}
            >
              <CadRemoveVertexIcon />
            </CadIconButton>

            <CadIconButton
              label="Lägg till normal brytpunkt (håll inne: ändra alla till normal)"
              active={vertexTool === "addNormal"}
              activeClass={iconActiveAdd}
              disabled={bezierActive || mergeActive}
              onClick={() => {
                onCutToolChange("off");
                if (mergeActive) onCancelMerge();
                const next = selectVertexTool(vertexTool, "addNormal");
                onVertexToolChange(next);
                onMessage(
                  next === "addNormal"
                    ? "Lägg till normal brytpunkt: klicka på linjen."
                    : null,
                );
              }}
              onLongPress={() => convertAllTo("normal")}
            >
              <CadAddNormalVertexIcon />
            </CadIconButton>

            <CadIconButton
              label="Lägg till hörnbrytpunkt (håll inne: ändra alla till hörn)"
              active={vertexTool === "addCorner"}
              activeClass={iconActiveAdd}
              disabled={bezierActive || mergeActive}
              onClick={() => {
                onCutToolChange("off");
                if (mergeActive) onCancelMerge();
                const next = selectVertexTool(vertexTool, "addCorner");
                onVertexToolChange(next);
                onMessage(
                  next === "addCorner"
                    ? "Lägg till hörnbrytpunkt: klicka på linjen."
                    : null,
                );
              }}
              onLongPress={() => convertAllTo("corner")}
            >
              <CadAddCornerVertexIcon />
            </CadIconButton>

            <CadIconButton
              label="Lägg till streckbrytpunkt (håll inne: ändra alla till streck)"
              active={vertexTool === "addDash"}
              activeClass={iconActiveAdd}
              disabled={bezierActive || mergeActive}
              onClick={() => {
                onCutToolChange("off");
                if (mergeActive) onCancelMerge();
                const next = selectVertexTool(vertexTool, "addDash");
                onVertexToolChange(next);
                onMessage(
                  next === "addDash"
                    ? "Lägg till streckbrytpunkt: klicka på linjen."
                    : null,
                );
              }}
              onLongPress={() => convertAllTo("dash")}
            >
              <CadAddDashVertexIcon />
            </CadIconButton>

            <CadIconButton
              label="Växla brytpunktstyp (normal → streck → hörn)"
              active={vertexTool === "toggleType"}
              disabled={editLocked}
              onClick={() => {
                onCutToolChange("off");
                if (mergeActive) onCancelMerge();
                const next = selectVertexTool(vertexTool, "toggleType");
                onVertexToolChange(next);
                onMessage(
                  next === "toggleType"
                    ? "Växla typ: klicka på brytpunkt (normal → streck → hörn)."
                    : null,
                );
              }}
            >
              <CadToggleVertexTypeIcon />
            </CadIconButton>

            <span className="mx-0.5 hidden h-8 w-px bg-slate-200 sm:inline-block" aria-hidden />

            {selectedObject.t === "line" && (
              <CadIconButton
                label="Klipp linje"
                active={cutTool === "cutLine"}
                activeClass="border-violet-600 bg-violet-600 text-white"
                disabled={bezierActive || mergeActive || fillBorderOpen}
                onClick={() => {
                  onVertexToolChange("off");
                  if (mergeActive) onCancelMerge();
                  const next = selectCutTool(cutTool, "cutLine");
                  onCutToolChange(next);
                  onMessage(
                    next === "cutLine"
                      ? "Klipp linje: klicka för att dela, eller dra längs linjen för att klippa bort en bit."
                      : null,
                  );
                }}
              >
                <CadCutLineIcon />
              </CadIconButton>
            )}

            {selectedObject.t === "area" && (
              <>
                <CadIconButton
                  label="Dela yta"
                  active={cutTool === "cutArea"}
                  activeClass="border-violet-600 bg-violet-600 text-white"
                  disabled={bezierActive || mergeActive || fillBorderOpen}
                  onClick={() => {
                    onVertexToolChange("off");
                    if (mergeActive) onCancelMerge();
                    const next = selectCutTool(cutTool, "cutArea");
                    onCutToolChange(next);
                    onMessage(
                      next === "cutArea"
                        ? "Dela yta: klicka klipplinje från kant till kant, sedan «Tillämpa klipp»."
                        : null,
                    );
                  }}
                >
                  <CadCutAreaIcon />
                </CadIconButton>
                <CadIconButton
                  label="Klipp hål"
                  active={cutTool === "cutHole"}
                  activeClass="border-violet-600 bg-violet-600 text-white"
                  disabled={bezierActive || mergeActive || fillBorderOpen}
                  onClick={() => {
                    onVertexToolChange("off");
                    if (mergeActive) onCancelMerge();
                    const next = selectCutTool(cutTool, "cutHole");
                    onCutToolChange(next);
                    onMessage(
                      next === "cutHole"
                        ? "Klipp hål: klicka hörnen för hålet (≥3), sedan «Tillämpa klipp»."
                        : null,
                    );
                  }}
                >
                  <CadCutHoleIcon />
                </CadIconButton>
              </>
            )}

            <CadIconButton
              label="Sammanfoga (merge)"
              active={mergeActive}
              activeClass="border-teal-600 bg-teal-600 text-white"
              disabled={bezierActive || cutActive || fillBorderOpen}
              onClick={() => {
                onVertexToolChange("off");
                onCutToolChange("off");
                if (fillBorderOpen) closeFillBorder();
                onToggleMerge();
              }}
            >
              <CadMergeIcon />
            </CadIconButton>

            <CadIconButton
              label="Vänd riktning"
              disabled={editLocked}
              onClick={() => {
                onVertexToolChange("off");
                onCutToolChange("off");
                if (mergeActive) onCancelMerge();
                const next = reverseVertices(rawCoords, selectedObject.t);
                const nextHandleKinds = [...vertexKinds].reverse();
                const geomKind = geometryKindFromType(selectedObject.t);
                onApplyCoordinates(
                  next,
                  vertexKindsForStoredCoordinates(next, nextHandleKinds, geomKind),
                );
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
                disabled={editLocked}
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
              disabled={editLocked}
              onClick={() => {
                onVertexToolChange("off");
                onCutToolChange("off");
                if (mergeActive) onCancelMerge();
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
              disabled={editLocked}
              onClick={() => {
                onVertexToolChange("off");
                onCutToolChange("off");
                if (mergeActive) onCancelMerge();
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
              disabled={(editCoords.length < 2 && !bezierActive) || cutActive || mergeActive}
              onClick={() => {
                onVertexToolChange("off");
                onCutToolChange("off");
                if (mergeActive) onCancelMerge();
                if (bezierActive) return;
                onStartBezier();
              }}
            >
              <CadBezierIcon />
            </CadIconButton>
          </>
        )}

        <span className="mx-0.5 hidden h-8 w-px bg-slate-200 sm:inline-block" aria-hidden />

        <CadIconButton
          label="Radera objekt"
          disabled={bezierActive || mergeActive || fillBorderOpen}
          inactiveClass={iconDanger}
          onClick={() => {
            if (!confirm("Radera valt objekt?")) return;
            onDelete();
          }}
        >
          <MapTrashToolIcon />
        </CadIconButton>
      </div>

      {showSymbolPicker && !bezierActive && !cutActive && !mergeActive && !fillBorderOpen && (
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

      {fillBorderOpen && (
        <div className="space-y-3 rounded-lg border border-sky-200 bg-sky-50/80 p-3">
          <p className="text-sm font-medium text-sky-950">
            Fyll / kant / duplicera
          </p>
          <p className="text-xs text-sky-900/80">
            Välj symbol som i OCAD: samma typ kopierar objektet, yta+linje skapar kant,
            linje+yta fyller, punkt+linje/yta använder omslutande rektangel.
          </p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Symboltyp">
            {(["line", "area", "point"] as FieldEditGeometryKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setFillTargetKind(k);
                  setFillTargetSymbol(symbolGroups[k][0]?.symNum ?? "");
                }}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                  fillTargetKind === k
                    ? "border-sky-600 bg-sky-600 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {k === "line" ? "Linje" : k === "area" ? "Yta" : "Punkt"}
              </button>
            ))}
          </div>
          <FieldEditSymbolPicker
            groups={symbolGroups}
            kind={fillTargetKind}
            value={fillTargetSymbol}
            onChange={(symNum) => {
              setFillTargetSymbol(symNum);
              const detected = findSymbolKind(symbolGroups, symNum);
              if (detected) setFillTargetKind(detected);
            }}
            favorites={favorites}
            onToggleFavorite={onToggleFavorite ? (sym) => onToggleFavorite(sym) : undefined}
          />
          {selectedObject.t === "area" && objectHoles.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-sky-950">
              <input
                type="checkbox"
                checked={fillUseHoles}
                onChange={(e) => setFillUseHoles(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Använd hål ({objectHoles.length}) i stället för ytterkant
            </label>
          )}
          {fillPlan && "error" in fillPlan && (
            <p className="text-xs text-red-700">{fillPlan.error}</p>
          )}
          {fillPlan && "label" in fillPlan && (
            <p className="text-xs font-medium text-sky-900">{fillPlan.label}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={
                fillTargetSymbol === "" || !fillPlan || "error" in fillPlan
              }
              onClick={() => {
                if (fillTargetSymbol === "") return;
                const targetKind =
                  findSymbolKind(symbolGroups, fillTargetSymbol) ?? fillTargetKind;
                onFillOrBorder({
                  targetSymbol: fillTargetSymbol,
                  targetKind,
                  useHoles: fillUseHoles,
                });
                closeFillBorder();
              }}
              className="min-h-11 flex-1 rounded-lg bg-sky-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0 sm:flex-none sm:py-2"
            >
              Tillämpa
            </button>
            <button
              type="button"
              onClick={closeFillBorder}
              className="min-h-11 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 sm:min-h-0 sm:flex-none sm:py-2"
            >
              Avbryt
            </button>
          </div>
        </div>
      )}

      {mergeActive && (
        <div className="space-y-2 rounded-lg border border-teal-200 bg-teal-50/80 p-3">
          <p className="text-sm font-medium text-teal-950">
            Sammanfoga — {mergeCount} objekt markerade
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canApplyMerge}
              onClick={onApplyMerge}
              className="min-h-11 flex-1 rounded-lg bg-teal-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0 sm:flex-none sm:py-2"
            >
              Tillämpa sammanfogning
            </button>
            <button
              type="button"
              onClick={onCancelMerge}
              className="min-h-11 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 sm:min-h-0 sm:flex-none sm:py-2"
            >
              Avbryt
            </button>
          </div>
        </div>
      )}

      {cutActive && (cutTool === "cutArea" || cutTool === "cutHole") && (
        <div className="space-y-2 rounded-lg border border-violet-200 bg-violet-50/80 p-3">
          <p className="text-sm font-medium text-violet-950">
            {cutTool === "cutArea"
              ? `Dela yta — ${cutDraftPoints.length} punkter i klipplinjen`
              : `Klipp hål — ${cutDraftPoints.length} hörn`}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canFinishCut}
              onClick={onFinishCut}
              className="min-h-11 flex-1 rounded-lg bg-violet-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0 sm:flex-none sm:py-2"
            >
              Tillämpa klipp
            </button>
            <button
              type="button"
              onClick={onCancelCut}
              className="min-h-11 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 sm:min-h-0 sm:flex-none sm:py-2"
            >
              Avbryt
            </button>
          </div>
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

      {!bezierActive && !mergeActive && (cutHint || vertexHint) && (
        <p className="text-xs text-slate-600">
          {cutHint ??
            `${vertexHint} Håll inne lägg till-ikonen för att ändra alla brytpunkter till den typen.`}
        </p>
      )}

      {mergeHint && (
        <p className="text-xs text-slate-600">{mergeHint}</p>
      )}
    </div>
  );
}
