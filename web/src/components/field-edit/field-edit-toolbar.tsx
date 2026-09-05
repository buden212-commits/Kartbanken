"use client";

import {
  MapAreaToolIcon,
  MapCancelDraftIcon,
  MapDeleteToolIcon,
  MapDrawModeIcon,
  MapFinishDraftIcon,
  MapGpsToolIcon,
  MapLineToolIcon,
  MapNavigateModeIcon,
  MapPointToolIcon,
  MapSelectToolIcon,
  MapUndoToolIcon,
} from "@/components/map-draw-tool-icons";
import { useRef } from "react";

export type FieldEditTool =
  | "select"
  | "delete"
  | "addPoint"
  | "addLine"
  | "addArea";

export const FIELD_EDIT_TOOL_LABELS: Record<FieldEditTool, string> = {
  select: "Välj / redigera",
  delete: "Radera",
  addPoint: "Ny punkt",
  addLine: "Ny linje",
  addArea: "Ny yta",
};

const DRAW_TOOLS: FieldEditTool[] = [
  "select",
  "addPoint",
  "addLine",
  "addArea",
  "delete",
];

const LONG_PRESS_MS = 480;

const iconBtnBase =
  "group relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ifk-blue/30 disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 sm:w-10";
const iconBtnActiveSelect = "border-ifk-blue bg-ifk-blue text-white";
const iconBtnActiveAdd = "border-emerald-600 bg-emerald-600 text-white";
const iconBtnActiveDelete = "border-red-600 bg-red-600 text-white";
const iconBtnInactive =
  "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50";
const iconBtnDeleteInactive =
  "border-slate-200 bg-white text-red-600 hover:border-red-200 hover:bg-red-50";
const iconBtnTracking = "border-amber-600 bg-amber-600 text-white";
const iconBtnGpsInactive =
  "border-slate-200 bg-white text-ifk-blue hover:border-ifk-blue/40 hover:bg-ifk-blue/5";

const tooltipClass =
  "pointer-events-none absolute right-full top-1/2 z-40 mr-2 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-800 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-sm transition group-hover:opacity-100 group-focus-visible:opacity-100 sm:block";

export function stopFieldEditToolbarPointer(e: React.PointerEvent | React.MouseEvent) {
  e.stopPropagation();
}

function MapToolbarPanel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-lg backdrop-blur"
      role="group"
      aria-label={label}
    >
      {children}
    </div>
  );
}

function ToolbarTooltip({ label }: { label: string }) {
  return (
    <span role="tooltip" className={tooltipClass}>
      {label}
    </span>
  );
}

function BezierModeBadge() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute -bottom-0.5 -right-0.5 rounded bg-slate-900/85 px-0.5 text-[9px] font-bold leading-tight text-white"
    >
      B
    </span>
  );
}

function RectangularModeBadge() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute -bottom-0.5 -right-0.5 rounded bg-slate-900/85 px-0.5 text-[9px] font-bold leading-tight text-white"
    >
      R
    </span>
  );
}

function FreehandModeBadge() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute -bottom-0.5 -right-0.5 rounded bg-slate-900/85 px-0.5 text-[9px] font-bold leading-tight text-white"
    >
      F
    </span>
  );
}

function CircleModeBadge() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute -bottom-0.5 -right-0.5 rounded bg-slate-900/85 px-0.5 text-[9px] font-bold leading-tight text-white"
    >
      C
    </span>
  );
}

function EllipseModeBadge() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute -bottom-0.5 -right-0.5 rounded bg-slate-900/85 px-0.5 text-[9px] font-bold leading-tight text-white"
    >
      E
    </span>
  );
}

function DraftCountBadge({ count }: { count: number }) {
  const label = count > 99 ? "99+" : String(count);
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute -bottom-0.5 -right-0.5 min-w-[1.1rem] rounded bg-emerald-800 px-0.5 text-center text-[9px] font-bold leading-tight text-white"
    >
      {label}
    </span>
  );
}

function IconToolbarButton({
  label,
  active,
  activeClass,
  inactiveClass = iconBtnInactive,
  disabled,
  onClick,
  onLongPress,
  badge,
  children,
}: {
  label: string;
  active: boolean;
  activeClass: string;
  inactiveClass?: string;
  disabled?: boolean;
  onClick: () => void;
  onLongPress?: () => void;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressedRef = useRef(false);

  function clearLongPressTimer() {
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
        stopFieldEditToolbarPointer(e);
        if (!onLongPress || disabled) return;
        longPressedRef.current = false;
        clearLongPressTimer();
        timerRef.current = setTimeout(() => {
          longPressedRef.current = true;
          timerRef.current = null;
          onLongPress();
        }, LONG_PRESS_MS);
      }}
      onPointerUp={clearLongPressTimer}
      onPointerLeave={clearLongPressTimer}
      onPointerCancel={clearLongPressTimer}
      className={`${iconBtnBase} ${active ? activeClass : inactiveClass}`}
    >
      {children}
      {badge}
      <ToolbarTooltip label={label} />
    </button>
  );
}

function ToolIcon({ tool }: { tool: FieldEditTool }) {
  switch (tool) {
    case "select":
      return <MapSelectToolIcon />;
    case "addPoint":
      return <MapPointToolIcon />;
    case "addLine":
      return <MapLineToolIcon />;
    case "addArea":
      return <MapAreaToolIcon />;
    case "delete":
      return <MapDeleteToolIcon />;
  }
}

function activeClassForTool(tool: FieldEditTool): string {
  if (tool === "delete") return iconBtnActiveDelete;
  if (tool === "select") return iconBtnActiveSelect;
  return iconBtnActiveAdd;
}

type ToolbarsProps = {
  tool: FieldEditTool;
  onToolChange: (tool: FieldEditTool) => void;
  drawDisabled?: boolean;
  mapMode: "draw" | "navigate";
  onMapModeChange: (mode: "draw" | "navigate") => void;
  gpsTracking: boolean;
  canUseGpsTracking: boolean;
  onGpsToggle: () => void;
  canUndo: boolean;
  onUndo: () => void;
  bezierDrawMode: boolean;
  rectangularDrawMode: boolean;
  circleDrawMode: boolean;
  ellipseDrawMode: boolean;
  freehandDrawMode: boolean;
  onCycleLineAreaDrawMode: (tool: "addLine" | "addArea") => void;
  showDraftActions?: boolean;
  draftPointCount?: number;
  onFinishDraft?: () => void;
  onCancelDraft?: () => void;
};

export function FieldEditMapToolbars({
  tool,
  onToolChange,
  drawDisabled = false,
  mapMode,
  onMapModeChange,
  gpsTracking,
  canUseGpsTracking,
  onGpsToggle,
  canUndo,
  onUndo,
  bezierDrawMode,
  rectangularDrawMode,
  circleDrawMode,
  ellipseDrawMode,
  freehandDrawMode,
  onCycleLineAreaDrawMode,
  showDraftActions = false,
  draftPointCount = 0,
  onFinishDraft,
  onCancelDraft,
}: ToolbarsProps) {
  const gpsLabel = gpsTracking ? "Sluta spåra" : "GPS-spår";
  const gpsTitle =
    canUseGpsTracking || gpsTracking
      ? gpsLabel
      : "GPS-spårning kräver georefererad karta";

  return (
    <div
      data-map-toolbar
      className="pointer-events-auto absolute right-2 top-2 z-40 flex flex-col gap-2 sm:right-3 sm:top-1/2 sm:-translate-y-1/2"
      role="toolbar"
      aria-label="Fältredigeringsverktyg"
      onPointerDown={stopFieldEditToolbarPointer}
    >
      <MapToolbarPanel label="Verktyg">
        {DRAW_TOOLS.map((drawTool) => {
          const supportsDrawModes = drawTool === "addLine" || drawTool === "addArea";
          const showFreehandBadge =
            supportsDrawModes && freehandDrawMode && tool === drawTool;
          const showBezierBadge =
            supportsDrawModes && bezierDrawMode && tool === drawTool && !freehandDrawMode;
          const showEllipseBadge =
            supportsDrawModes &&
            ellipseDrawMode &&
            tool === drawTool &&
            !bezierDrawMode &&
            !freehandDrawMode;
          const showCircleBadge =
            supportsDrawModes &&
            circleDrawMode &&
            tool === drawTool &&
            !ellipseDrawMode &&
            !bezierDrawMode &&
            !freehandDrawMode;
          const showRectBadge =
            supportsDrawModes &&
            rectangularDrawMode &&
            tool === drawTool &&
            !circleDrawMode &&
            !ellipseDrawMode &&
            !bezierDrawMode &&
            !freehandDrawMode;
          const cycleHint =
            "vanlig → rektangel (R) → cirkel (C) → ellips (E) → Bézier (B) → frihand (F)";
          let modeHint = "";
          if (supportsDrawModes) {
            if (freehandDrawMode && tool === drawTool) {
              modeHint = ` (frihand — klicka igen: ${cycleHint})`;
            } else if (bezierDrawMode && tool === drawTool) {
              modeHint = ` (Bézier — klicka igen: ${cycleHint})`;
            } else if (ellipseDrawMode && tool === drawTool) {
              modeHint = ` (ellips — klicka igen: ${cycleHint})`;
            } else if (circleDrawMode && tool === drawTool) {
              modeHint = ` (cirkel — klicka igen: ${cycleHint})`;
            } else if (rectangularDrawMode && tool === drawTool) {
              modeHint = ` (rektangel — klicka igen: ${cycleHint})`;
            } else if (tool === drawTool) {
              modeHint = ` (klicka igen: ${cycleHint})`;
            } else {
              modeHint = ` (klicka igen när aktiv: ${cycleHint})`;
            }
          }
          const label = `${FIELD_EDIT_TOOL_LABELS[drawTool]}${modeHint}`;
          return (
            <IconToolbarButton
              key={drawTool}
              label={label}
              active={tool === drawTool && !drawDisabled}
              activeClass={activeClassForTool(drawTool)}
              inactiveClass={drawTool === "delete" ? iconBtnDeleteInactive : iconBtnInactive}
              disabled={drawDisabled}
              onClick={() => {
                // Already on line/area tool → cycle draw properties (R/C/E/B/F).
                if (supportsDrawModes && tool === drawTool) {
                  onCycleLineAreaDrawMode(drawTool);
                  return;
                }
                onToolChange(drawTool);
              }}
              onLongPress={
                supportsDrawModes
                  ? () => onCycleLineAreaDrawMode(drawTool)
                  : undefined
              }
              badge={
                showFreehandBadge ? (
                  <FreehandModeBadge />
                ) : showBezierBadge ? (
                  <BezierModeBadge />
                ) : showEllipseBadge ? (
                  <EllipseModeBadge />
                ) : showCircleBadge ? (
                  <CircleModeBadge />
                ) : showRectBadge ? (
                  <RectangularModeBadge />
                ) : null
              }
            >
              <ToolIcon tool={drawTool} />
            </IconToolbarButton>
          );
        })}
        <IconToolbarButton
          label={gpsTitle}
          active={gpsTracking}
          activeClass={iconBtnTracking}
          inactiveClass={iconBtnGpsInactive}
          disabled={!canUseGpsTracking && !gpsTracking}
          onClick={onGpsToggle}
        >
          <MapGpsToolIcon />
        </IconToolbarButton>
      </MapToolbarPanel>
      {showDraftActions && onFinishDraft && onCancelDraft && (
        <MapToolbarPanel label="Ritning">
          <IconToolbarButton
            label={`Klar (${draftPointCount} pkt)`}
            active
            activeClass="border-emerald-600 bg-emerald-600 text-white"
            onClick={onFinishDraft}
            badge={<DraftCountBadge count={draftPointCount} />}
          >
            <MapFinishDraftIcon />
          </IconToolbarButton>
          <IconToolbarButton
            label="Avbryt ritning"
            active={false}
            activeClass="border-red-600 bg-red-600 text-white"
            inactiveClass="border-slate-200 bg-white text-slate-700 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
            onClick={onCancelDraft}
          >
            <MapCancelDraftIcon />
          </IconToolbarButton>
        </MapToolbarPanel>
      )}
      <MapToolbarPanel label="Kartläge">
        <IconToolbarButton
          label="Rita och redigera"
          active={mapMode === "draw"}
          activeClass={iconBtnActiveSelect}
          onClick={() => onMapModeChange("draw")}
        >
          <MapDrawModeIcon />
        </IconToolbarButton>
        <IconToolbarButton
          label="Navigera — panorera och zooma"
          active={mapMode === "navigate"}
          activeClass={iconBtnActiveSelect}
          onClick={() => onMapModeChange("navigate")}
        >
          <MapNavigateModeIcon />
        </IconToolbarButton>
      </MapToolbarPanel>
      <MapToolbarPanel label="Ångra">
        <IconToolbarButton
          label="Ångra senaste ändring (Ctrl/Cmd+Z)"
          active={false}
          activeClass={iconBtnActiveSelect}
          disabled={!canUndo}
          onClick={onUndo}
        >
          <MapUndoToolIcon />
        </IconToolbarButton>
      </MapToolbarPanel>
    </div>
  );
}

const actionBtnNeutral =
  "min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";
const actionBtnBlue =
  "min-h-11 rounded-lg bg-ifk-blue px-3 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-ifk-blue/90 disabled:cursor-not-allowed disabled:opacity-50";

type PublishBarProps = {
  publishing: boolean;
  canUndo: boolean;
  onUndo: () => void;
  onPublish: () => void;
  onCancel: () => void;
  countsLabel?: string;
  syncLabel?: string;
};

export function FieldEditPublishBar({
  publishing,
  canUndo,
  onUndo,
  onPublish,
  onCancel,
  countsLabel,
  syncLabel,
}: PublishBarProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm supports-[padding:max(0px)]:pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="min-w-0 space-y-1">
          <p className="text-sm text-slate-600">
            Checka in för jämförelse — admin godkänner innan ny version skapas.
          </p>
          {(countsLabel || syncLabel) && (
            <p className="text-xs text-slate-500 sm:hidden">
              {[countsLabel, syncLabel].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:ml-auto sm:flex sm:gap-3">
          <button
            type="button"
            disabled={!canUndo || publishing}
            onClick={onUndo}
            className={`${actionBtnNeutral}`}
          >
            Ångra
          </button>
          <button
            type="button"
            disabled={publishing}
            onClick={onPublish}
            className={`col-span-2 sm:col-span-1 ${actionBtnBlue} sm:min-w-[10rem]`}
          >
            {publishing ? "Förbereder…" : "Checka in"}
          </button>
          <button
            type="button"
            disabled={publishing}
            onClick={onCancel}
            className={`${actionBtnNeutral}`}
          >
            Avbryt session
          </button>
        </div>
      </div>
    </div>
  );
}
