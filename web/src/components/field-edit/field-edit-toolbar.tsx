"use client";

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

const iconBtnBase =
  "group relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border-2 bg-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ifk-blue/30 disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 sm:w-10";
const iconBtnActiveSelect = "border-ifk-blue bg-ifk-blue text-white";
const iconBtnActiveAdd = "border-emerald-600 bg-emerald-600 text-white";
const iconBtnActiveDelete = "border-red-600 bg-red-600 text-white";
const iconBtnInactive = "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50";
const iconBtnDeleteInactive =
  "border-slate-200 text-red-600 hover:border-red-200 hover:bg-red-50";
const iconBtnTracking = "border-amber-600 bg-amber-600 text-white";
const iconBtnGpsInactive =
  "border-slate-200 text-ifk-blue hover:border-ifk-blue/40 hover:bg-ifk-blue/5";

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

function IconToolbarButton({
  label,
  active,
  activeClass,
  inactiveClass = iconBtnInactive,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  activeClass: string;
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
      onPointerDown={stopFieldEditToolbarPointer}
      className={`${iconBtnBase} ${active ? activeClass : inactiveClass}`}
    >
      {children}
      <ToolbarTooltip label={label} />
    </button>
  );
}

function SelectIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <path
        d="M4.5 14.5 8.5 4.5 11.5 11.5 16.5 7.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8.5" cy="4.5" r="1.5" fill="currentColor" />
    </svg>
  );
}

function PointIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <circle cx="10" cy="10" r="5" className="fill-emerald-500" />
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

function AreaIcon() {
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
      <path
        d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
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
    </svg>
  );
}

function ToolIcon({ tool }: { tool: FieldEditTool }) {
  switch (tool) {
    case "select":
      return <SelectIcon />;
    case "addPoint":
      return <PointIcon />;
    case "addLine":
      return <LineIcon />;
    case "addArea":
      return <AreaIcon />;
    case "delete":
      return <DeleteIcon />;
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
        {DRAW_TOOLS.map((drawTool) => (
          <IconToolbarButton
            key={drawTool}
            label={FIELD_EDIT_TOOL_LABELS[drawTool]}
            active={tool === drawTool && !drawDisabled}
            activeClass={activeClassForTool(drawTool)}
            inactiveClass={drawTool === "delete" ? iconBtnDeleteInactive : iconBtnInactive}
            disabled={drawDisabled}
            onClick={() => onToolChange(drawTool)}
          >
            <ToolIcon tool={drawTool} />
          </IconToolbarButton>
        ))}
        <IconToolbarButton
          label={gpsTitle}
          active={gpsTracking}
          activeClass={iconBtnTracking}
          inactiveClass={iconBtnGpsInactive}
          disabled={!canUseGpsTracking && !gpsTracking}
          onClick={onGpsToggle}
        >
          <GpsIcon />
        </IconToolbarButton>
      </MapToolbarPanel>
      <MapToolbarPanel label="Kartläge">
        <IconToolbarButton
          label="Rita och redigera"
          active={mapMode === "draw"}
          activeClass={iconBtnActiveSelect}
          onClick={() => onMapModeChange("draw")}
        >
          <DrawModeIcon />
        </IconToolbarButton>
        <IconToolbarButton
          label="Navigera — panorera och zooma"
          active={mapMode === "navigate"}
          activeClass={iconBtnActiveSelect}
          onClick={() => onMapModeChange("navigate")}
        >
          <NavigateModeIcon />
        </IconToolbarButton>
      </MapToolbarPanel>
    </div>
  );
}

const actionBtnNeutral =
  "min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";
const actionBtnPrimary =
  "min-h-11 rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50";
const actionBtnBlue =
  "min-h-11 rounded-lg bg-ifk-blue px-3 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-ifk-blue/90 disabled:cursor-not-allowed disabled:opacity-50";

type ActionBarProps = {
  showDraftActions: boolean;
  draftPointCount: number;
  onFinishDraft: () => void;
  onCancelDraft: () => void;
  countsLabel: string;
  syncLabel: string;
};

export function FieldEditMapDraftBar({
  showDraftActions,
  draftPointCount,
  onFinishDraft,
  onCancelDraft,
  countsLabel,
  syncLabel,
}: ActionBarProps) {
  if (!showDraftActions) {
    return (
      <div
        data-map-toolbar
        className="pointer-events-auto absolute inset-x-2 bottom-2 z-40 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs text-slate-600 shadow-lg backdrop-blur sm:hidden"
        onPointerDown={stopFieldEditToolbarPointer}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>{countsLabel}</span>
          <span>{syncLabel}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      data-map-toolbar
      className="pointer-events-auto absolute inset-x-2 bottom-2 z-40 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur sm:hidden"
      role="toolbar"
      aria-label="Ritåtgärder"
      onPointerDown={stopFieldEditToolbarPointer}
    >
      <button
        type="button"
        onClick={onFinishDraft}
        onPointerDown={stopFieldEditToolbarPointer}
        className={`col-span-2 ${actionBtnPrimary}`}
      >
        Klar ({draftPointCount} pkt)
      </button>
      <button
        type="button"
        onClick={onCancelDraft}
        onPointerDown={stopFieldEditToolbarPointer}
        className={`col-span-2 ${actionBtnNeutral}`}
      >
        Avbryt ritning
      </button>
      <p className="col-span-2 text-center text-xs text-slate-500">
        {countsLabel} · {syncLabel}
      </p>
    </div>
  );
}

type PublishBarProps = {
  publishAfter: boolean;
  onPublishAfterChange: (value: boolean) => void;
  publishing: boolean;
  onPublish: () => void;
  onCancel: () => void;
};

export function FieldEditPublishBar({
  publishAfter,
  onPublishAfterChange,
  publishing,
  onPublish,
  onCancel,
}: PublishBarProps) {
  return (
    <div className="sticky bottom-0 z-30 -mx-2 border-t border-slate-200 bg-white/95 px-2 py-3 shadow-[0_-4px_16px_rgba(15,23,42,0.08)] backdrop-blur supports-[padding:max(0px)]:pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:static sm:mx-0 sm:rounded-xl sm:border sm:shadow-sm sm:backdrop-blur-none">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={publishAfter}
            onChange={(e) => onPublishAfterChange(e.target.checked)}
            className="h-4 w-4"
          />
          Publicera ny version direkt
        </label>
        <div className="grid grid-cols-2 gap-2 sm:ml-auto sm:flex sm:gap-3">
          <button
            type="button"
            disabled={publishing}
            onClick={onPublish}
            className={`col-span-2 sm:col-span-1 ${actionBtnBlue} sm:min-w-[10rem]`}
          >
            {publishing ? "Publicerar…" : "Publicera"}
          </button>
          <button
            type="button"
            disabled={publishing}
            onClick={onCancel}
            className={`${actionBtnNeutral}`}
          >
            Avbryt
          </button>
        </div>
      </div>
    </div>
  );
}
