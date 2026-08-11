"use client";

export type SuggestionDrawTool = "pin" | "rectangle" | "polygon" | "line" | "delete";

export const SUGGESTION_DRAW_TOOL_LABELS: Record<SuggestionDrawTool, string> = {
  pin: "Punkt",
  rectangle: "Rektangel",
  polygon: "Polygon",
  line: "Linje",
  delete: "Radera objektet",
};

const DRAW_TOOLS: SuggestionDrawTool[] = ["pin", "rectangle", "polygon", "line", "delete"];

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

function PointIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <circle cx="10" cy="10" r="5" className="fill-[#FD3DB5]" />
    </svg>
  );
}

function RectangleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <rect
        x="4"
        y="5.5"
        width="12"
        height="9"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeDasharray="3 2"
      />
    </svg>
  );
}

function PolygonIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <path
        d="M10 3.5 16.5 8 14 16.5H6L3.5 8 10 3.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LineIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <path
        d="M4 14.5 8 6.5 12.5 11 16 4.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M7 7 13 13M13 7 7 13"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GpsIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="10" cy="10" r="2.5" fill="currentColor" />
      <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function DrawModeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <path
        d="M13.5 3.5 16.5 6.5 6.5 16.5H4v-2.5L13.5 3.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M11.5 5.5 14.5 8.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M4 16.5 2.5 18"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function NavigateModeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
      <rect x="3.25" y="12.25" width="3.5" height="7.25" rx="1.75" transform="rotate(-32 5 15.875)" />
      <rect x="7.75" y="4.75" width="3.25" height="12.75" rx="1.625" />
      <rect x="11.875" y="3.25" width="3.25" height="14.25" rx="1.625" />
      <rect x="16" y="5.25" width="3.25" height="12.25" rx="1.625" />
      <rect x="20.125" y="7.75" width="2.75" height="9.75" rx="1.375" />
      <path d="M6.75 16.25h13.75c1.45 0 2.625 1.175 2.625 2.625v1.125c0 2.2-1.8 4-4 4h-11c-2.2 0-4-1.8-4-4v-1.125c0-1.45 1.175-2.625 2.625-2.625Z" />
    </svg>
  );
}

function ToolIcon({ tool }: { tool: SuggestionDrawTool }) {
  switch (tool) {
    case "pin":
      return <PointIcon />;
    case "rectangle":
      return <RectangleIcon />;
    case "polygon":
      return <PolygonIcon />;
    case "line":
      return <LineIcon />;
    case "delete":
      return <DeleteIcon />;
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
      {DRAW_TOOLS.slice(0, 4).map(renderDrawTool)}
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
          <GpsIcon />
        </IconToolbarButton>
      )}
      {renderDrawTool("delete")}
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
        <DrawModeIcon />
      </IconToolbarButton>
      <IconToolbarButton
        label="Navigera"
        active={mapMode === "navigate"}
        onClick={() => onMapModeChange("navigate")}
      >
        <NavigateModeIcon />
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
