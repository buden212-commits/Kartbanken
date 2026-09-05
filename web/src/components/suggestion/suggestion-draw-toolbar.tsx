"use client";

import {
  MapAreaToolIcon,
  MapDeleteToolIcon,
  MapDrawModeIcon,
  MapGpsToolIcon,
  MapLineToolIcon,
  MapNavigateModeIcon,
  MapPointToolIcon,
  MapRectangleToolIcon,
} from "@/components/map-draw-tool-icons";

export type SuggestionDrawTool = "pin" | "rectangle" | "polygon" | "line" | "delete";

export const SUGGESTION_DRAW_TOOL_LABELS: Record<SuggestionDrawTool, string> = {
  pin: "Punkt",
  rectangle: "Rektangel",
  polygon: "Polygon",
  line: "Linje",
  delete: "Radera objektet",
};

const DRAW_TOOLS: SuggestionDrawTool[] = ["pin", "line", "polygon", "rectangle", "delete"];

const iconBtnBase =
  "group relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 bg-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ifk-blue/30 disabled:cursor-not-allowed disabled:opacity-50";
const iconBtnActive = "border-red-600";
const iconBtnTracking = "border-amber-600";
const iconBtnInactive =
  "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50";
const iconBtnDeleteInactive =
  "border-slate-200 text-red-600 hover:border-red-200 hover:bg-red-50";
const iconBtnGpsInactive =
  "border-slate-200 text-ifk-blue hover:border-ifk-blue/40 hover:bg-ifk-blue/5";

const tooltipClass =
  "pointer-events-none absolute right-full top-1/2 z-40 mr-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-800 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-sm transition group-hover:opacity-100 group-focus-visible:opacity-100";

function ToolbarTooltip({ label }: { label: string }) {
  return (
    <span role="tooltip" className={tooltipClass}>
      {label}
    </span>
  );
}

export function stopMapToolbarPointer(e: React.PointerEvent | React.MouseEvent) {
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

function IconToolbarButton({
  label,
  active,
  activeClass = iconBtnActive,
  inactiveClass = iconBtnInactive,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  activeClass?: string;
  inactiveClass?: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      onPointerDown={stopMapToolbarPointer}
      className={`${iconBtnBase} ${active ? activeClass : inactiveClass}`}
    >
      {children}
      <ToolbarTooltip label={label} />
    </button>
  );
}

function ToolIcon({ tool }: { tool: SuggestionDrawTool }) {
  switch (tool) {
    case "pin":
      return <MapPointToolIcon />;
    case "line":
      return <MapLineToolIcon />;
    case "polygon":
      return <MapAreaToolIcon />;
    case "rectangle":
      return <MapRectangleToolIcon />;
    case "delete":
      return <MapDeleteToolIcon />;
  }
}

type DrawToolbarProps = {
  tool: SuggestionDrawTool;
  onToolChange: (tool: SuggestionDrawTool) => void;
  disabled?: boolean;
  gpsTracking?: boolean;
  canUseGpsTracking?: boolean;
  onGpsTrackingToggle?: () => void;
};

function DrawToolsPanel({
  tool,
  onToolChange,
  disabled = false,
  gpsTracking = false,
  canUseGpsTracking = false,
  onGpsTrackingToggle,
}: DrawToolbarProps) {
  const showGps = Boolean(onGpsTrackingToggle);
  const gpsLabel = gpsTracking ? "Sluta spåra" : "GPS-spår";
  const gpsTitle =
    canUseGpsTracking || gpsTracking
      ? gpsLabel
      : "GPS-spårning kräver georefererad karta";

  const renderDrawTool = (drawTool: SuggestionDrawTool) => {
    const active = tool === drawTool && !disabled;
    const label = SUGGESTION_DRAW_TOOL_LABELS[drawTool];
    const inactiveClass =
      drawTool === "delete" ? iconBtnDeleteInactive : iconBtnInactive;

    return (
      <IconToolbarButton
        key={drawTool}
        label={label}
        active={active}
        inactiveClass={inactiveClass}
        disabled={disabled}
        onClick={() => onToolChange(drawTool)}
      >
        <ToolIcon tool={drawTool} />
      </IconToolbarButton>
    );
  };

  return (
    <MapToolbarPanel label="Ritverktyg">
      {DRAW_TOOLS.map(renderDrawTool)}
      {showGps && (
        <IconToolbarButton
          key="gps"
          label={gpsTitle}
          active={gpsTracking}
          activeClass={iconBtnTracking}
          inactiveClass={iconBtnGpsInactive}
          disabled={!canUseGpsTracking && !gpsTracking}
          onClick={onGpsTrackingToggle!}
        >
          <MapGpsToolIcon />
        </IconToolbarButton>
      )}
    </MapToolbarPanel>
  );
}

type ModeToolbarProps = {
  mapMode: "draw" | "navigate";
  onMapModeChange: (mode: "draw" | "navigate") => void;
};

function ModeToolsPanel({ mapMode, onMapModeChange }: ModeToolbarProps) {
  return (
    <MapToolbarPanel label="Kartläge">
      <IconToolbarButton
        label="Rita"
        active={mapMode === "draw"}
        onClick={() => onMapModeChange("draw")}
      >
        <MapDrawModeIcon />
      </IconToolbarButton>
      <IconToolbarButton
        label="Navigera"
        active={mapMode === "navigate"}
        onClick={() => onMapModeChange("navigate")}
      >
        <MapNavigateModeIcon />
      </IconToolbarButton>
    </MapToolbarPanel>
  );
}

export function SuggestionMapRightToolbars({
  tool,
  onToolChange,
  drawDisabled,
  mapMode,
  onMapModeChange,
  gpsTracking,
  canUseGpsTracking,
  onGpsTrackingToggle,
}: Pick<DrawToolbarProps, "tool" | "onToolChange"> &
  ModeToolbarProps & {
    drawDisabled?: boolean;
    gpsTracking: boolean;
    canUseGpsTracking: boolean;
    onGpsTrackingToggle: () => void;
  }) {
  return (
    <div
      data-map-toolbar
      className="pointer-events-auto absolute right-2 top-2 z-40 flex flex-col gap-2 sm:right-3 sm:top-1/2 sm:-translate-y-1/2"
      role="toolbar"
      aria-label="Kartverktyg"
      onPointerDown={stopMapToolbarPointer}
    >
      <DrawToolsPanel
        tool={tool}
        onToolChange={onToolChange}
        disabled={drawDisabled}
        gpsTracking={gpsTracking}
        canUseGpsTracking={canUseGpsTracking}
        onGpsTrackingToggle={onGpsTrackingToggle}
      />
      <ModeToolsPanel mapMode={mapMode} onMapModeChange={onMapModeChange} />
    </div>
  );
}

/** @deprecated Använd SuggestionMapRightToolbars */
export function SuggestionMapDrawToolbar(
  props: Pick<DrawToolbarProps, "tool" | "onToolChange" | "disabled">,
) {
  return (
    <div
      data-map-toolbar
      className="pointer-events-auto absolute right-2 top-2 z-40 sm:right-3 sm:top-1/2 sm:-translate-y-1/2"
      onPointerDown={stopMapToolbarPointer}
    >
      <DrawToolsPanel {...props} />
    </div>
  );
}

const actionBtnNeutral =
  "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0 sm:w-auto sm:px-2.5 sm:py-1.5 sm:text-xs lg:text-sm";
const actionBtnPrimary =
  "min-h-11 w-full rounded-lg bg-ifk-blue px-3 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-ifk-blue/90 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0 sm:w-auto sm:px-2.5 sm:py-1.5 sm:text-xs lg:text-sm";

type ActionToolbarProps = {
  canAddMarking: boolean;
  markingCount: number;
  onAddMarking: () => void;
  onClear: () => void;
  onSubmit: () => void;
};

export function SuggestionMapActionToolbar({
  canAddMarking,
  markingCount,
  onAddMarking,
  onClear,
  onSubmit,
}: ActionToolbarProps) {
  const submitLabelLong =
    markingCount > 0
      ? `Skicka in kartförslag (${markingCount} st)`
      : "Skicka in kartförslag";
  const submitLabelShort =
    markingCount > 0 ? `Skicka in (${markingCount})` : "Skicka in kartförslag";

  return (
    <div
      data-map-toolbar
      className="pointer-events-auto absolute inset-x-2 bottom-2 z-40 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur sm:inset-x-auto sm:bottom-auto sm:right-3 sm:top-3 sm:flex sm:max-w-none sm:flex-wrap sm:justify-end sm:gap-1.5 sm:p-1.5"
      role="toolbar"
      aria-label="Åtgärder"
      onPointerDown={stopMapToolbarPointer}
    >
      <button
        type="button"
        disabled={!canAddMarking}
        onClick={onAddMarking}
        onPointerDown={stopMapToolbarPointer}
        className={canAddMarking ? actionBtnPrimary : actionBtnNeutral}
      >
        <span className="sm:hidden">Lägg till</span>
        <span className="hidden sm:inline">Lägg till ändring</span>
      </button>
      <button
        type="button"
        onClick={onClear}
        onPointerDown={stopMapToolbarPointer}
        className={actionBtnNeutral}
      >
        Rensa
      </button>
      <button
        type="button"
        disabled={markingCount < 1}
        onClick={onSubmit}
        onPointerDown={stopMapToolbarPointer}
        className={`col-span-2 sm:col-span-1 ${markingCount > 0 ? actionBtnPrimary : actionBtnNeutral}`}
      >
        <span className="sm:hidden">{submitLabelShort}</span>
        <span className="hidden sm:inline">{submitLabelLong}</span>
      </button>
    </div>
  );
}
