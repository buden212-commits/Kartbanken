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
  "group relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ifk-blue/30 disabled:cursor-not-allowed disabled:opacity-50";
const iconBtnActive = "border-ifk-blue bg-ifk-blue text-white hover:bg-ifk-blue";
const iconBtnInactive =
  "border-slate-200 text-slate-600 hover:border-ifk-blue/40 hover:bg-ifk-blue-pale hover:text-ifk-blue";
const iconBtnDeleteActive = "border-red-600 bg-red-600 text-white hover:bg-red-700";
const iconBtnDeleteInactive =
  "border-slate-200 text-red-600 hover:border-red-200 hover:bg-red-50";

const tooltipClass =
  "pointer-events-none absolute right-full top-1/2 z-40 mr-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-800 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-sm transition group-hover:opacity-100 group-focus-visible:opacity-100";

function ToolbarTooltip({ label }: { label: string }) {
  return (
    <span role="tooltip" className={tooltipClass}>
      {label}
    </span>
  );
}

function stopMapPointer(e: React.PointerEvent | React.MouseEvent) {
  e.stopPropagation();
}

function PointIcon({ active }: { active: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <circle
        cx="10"
        cy="10"
        r="5"
        className={active ? "fill-white" : "fill-[#FD3DB5]"}
      />
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

function ToolIcon({ tool, active }: { tool: SuggestionDrawTool; active: boolean }) {
  switch (tool) {
    case "pin":
      return <PointIcon active={active} />;
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

type Props = {
  tool: SuggestionDrawTool;
  onToolChange: (tool: SuggestionDrawTool) => void;
  disabled?: boolean;
};

export function SuggestionMapDrawToolbar({ tool, onToolChange, disabled = false }: Props) {
  return (
    <div
      data-map-toolbar
      className="pointer-events-auto absolute right-2 top-1/2 z-40 flex -translate-y-1/2 flex-col gap-1 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-lg backdrop-blur sm:right-3"
      role="toolbar"
      aria-label="Ritverktyg"
      onPointerDown={stopMapPointer}
    >
      {DRAW_TOOLS.map((drawTool) => {
        const active = tool === drawTool && !disabled;
        const label = SUGGESTION_DRAW_TOOL_LABELS[drawTool];
        const className =
          drawTool === "delete"
            ? `${iconBtnBase} ${active ? iconBtnDeleteActive : iconBtnDeleteInactive}`
            : `${iconBtnBase} ${active ? iconBtnActive : iconBtnInactive}`;

        return (
          <button
            key={drawTool}
            type="button"
            disabled={disabled}
            title={label}
            aria-label={label}
            aria-pressed={active}
            onClick={() => onToolChange(drawTool)}
            onPointerDown={stopMapPointer}
            className={className}
          >
            <ToolIcon tool={drawTool} active={active} />
            <ToolbarTooltip label={label} />
          </button>
        );
      })}
    </div>
  );
}

const actionBtnNeutral =
  "rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:px-3 sm:text-sm";
const actionBtnPrimary =
  "rounded-lg bg-ifk-blue px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-ifk-blue/90 disabled:cursor-not-allowed disabled:opacity-50 sm:px-3 sm:text-sm";

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
  return (
    <div
      data-map-toolbar
      className="pointer-events-auto absolute right-2 top-2 z-40 flex max-w-[calc(100%-4.5rem)] flex-wrap justify-end gap-1.5 rounded-xl border border-slate-200 bg-white/95 p-1.5 shadow-lg backdrop-blur sm:right-3 sm:top-3"
      role="toolbar"
      aria-label="Åtgärder"
      onPointerDown={stopMapPointer}
    >
      <button
        type="button"
        disabled={!canAddMarking}
        onClick={onAddMarking}
        onPointerDown={stopMapPointer}
        className={canAddMarking ? actionBtnPrimary : actionBtnNeutral}
      >
        Lägg till ändring
      </button>
      <button
        type="button"
        onClick={onClear}
        onPointerDown={stopMapPointer}
        className={actionBtnNeutral}
      >
        Rensa
      </button>
      <button
        type="button"
        disabled={markingCount < 1}
        onClick={onSubmit}
        onPointerDown={stopMapPointer}
        className={markingCount > 0 ? actionBtnPrimary : actionBtnNeutral}
      >
        {markingCount > 0
          ? `Skicka in kartförslag (${markingCount} st)`
          : "Skicka in kartförslag"}
      </button>
    </div>
  );
}
