/** Shared draw-tool icons for field edit and map suggestions — keep shapes identical. */

export function MapSelectToolIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
      <path d="M4.2 2.4 15.8 10.1c.35.23.2.78-.22.78H9.55l-2.2 5.85c-.14.38-.68.3-.78-.12L4.2 2.4Z" />
    </svg>
  );
}

export function MapTrashToolIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <path
        d="M7.5 4.5V3.75c0-.69.56-1.25 1.25-1.25h2.5c.69 0 1.25.56 1.25 1.25V4.5M4 4.5h12M15.25 4.5l-.7 10.15A1.5 1.5 0 0 1 13.06 16H6.94a1.5 1.5 0 0 1-1.49-1.35L4.75 4.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8.25 8v5.5M11.75 8v5.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function MapChangeSymbolToolIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <circle cx="7" cy="10" r="3.25" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="13" cy="10" r="3.25" stroke="currentColor" strokeWidth="1.75" strokeDasharray="2.5 2" />
      <path
        d="M9.5 6.5 12 4.5 14.5 6.5M10.5 13.5 8 15.5 5.5 13.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MapPointToolIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <circle cx="10" cy="10" r="5" className="fill-[#FD3DB5]" />
    </svg>
  );
}

export function MapLineToolIcon() {
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

export function MapAreaToolIcon() {
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

export function MapRectangleToolIcon() {
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

export function MapDeleteToolIcon() {
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

export function MapGpsToolIcon() {
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

export function MapDrawModeIcon() {
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

export function MapNavigateModeIcon() {
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

export function MapUndoToolIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <path
        d="M7.5 5.25 4.25 8.5 7.5 11.75"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4.5 8.5h7.25a3.75 3.75 0 1 1 0 7.5H8.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** CAD: remove vertex (OCAD-inspired). */
export function CadRemoveVertexIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <path
        d="M3.5 14.5 8 8.5 12 11.5 16.5 5.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="11.5" r="2.6" fill="white" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.6 11.5h2.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** CAD: add vertex (OCAD-inspired). */
export function CadAddVertexIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <path
        d="M3.5 14.5 8 8.5 12 11.5 16.5 5.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="11.5" r="2.6" fill="white" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12 10.1v2.8M10.6 11.5h2.8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** CAD: simplify polyline (fewer vertices). */
export function CadSimplifyIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <path
        d="M3.5 15.5 8.5 6.5 16.5 4.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="3.5" cy="15.5" r="1.6" fill="currentColor" />
      <circle cx="8.5" cy="6.5" r="1.6" fill="currentColor" />
      <circle cx="16.5" cy="4.5" r="1.6" fill="currentColor" />
    </svg>
  );
}

/** CAD: soft corners / smooth. */
export function CadSmoothCornersIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <path
        d="M4 15.5V8.5a4.5 4.5 0 0 1 4.5-4.5H16"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="4" cy="15.5" r="1.5" fill="currentColor" />
      <circle cx="16" cy="4" r="1.5" fill="currentColor" />
    </svg>
  );
}

/** CAD: Bézier curve with control handles. */
export function CadBezierIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <path
        d="M3.5 15C3.5 15 6 4.5 10 4.5S16.5 15 16.5 15"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M3.5 15 6.5 7.5M16.5 15 13.5 7.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeDasharray="2 1.5"
        strokeLinecap="round"
      />
      <circle cx="3.5" cy="15" r="1.5" fill="currentColor" />
      <circle cx="16.5" cy="15" r="1.5" fill="currentColor" />
      <rect x="5.4" y="6.4" width="2.2" height="2.2" rx="0.3" fill="currentColor" />
      <rect x="12.4" y="6.4" width="2.2" height="2.2" rx="0.3" fill="currentColor" />
    </svg>
  );
}

/** CAD: reverse object direction (OCAD). */
export function CadReverseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <path
        d="M4 7.5h9.5a3 3 0 0 1 0 6H11"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M6.5 4.75 4 7.5 6.5 10.25"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13.5 15.25 16 12.5 13.5 9.75"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** CAD: duplicate object (OCAD). */
export function CadDuplicateIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <rect
        x="6.5"
        y="6.5"
        width="9"
        height="9"
        rx="1.25"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M4.5 13.5V4.75A1.25 1.25 0 0 1 5.75 3.5H13.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** CAD: rotate object (OCAD). */
export function CadRotateIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <path
        d="M15.5 9.5a5.5 5.5 0 1 1-1.4-3.7"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M15.5 4.5v4h-4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="10" r="1.4" fill="currentColor" />
    </svg>
  );
}

/** CAD: measure length/area (OCAD). */
export function CadMeasureIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <path
        d="M3.5 14.5 14.5 3.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M6.2 11.8l1.1-1.1M8.4 9.6l1.1-1.1M10.6 7.4l1.1-1.1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="3.5" cy="14.5" r="1.5" fill="currentColor" />
      <circle cx="14.5" cy="3.5" r="1.5" fill="currentColor" />
    </svg>
  );
}
