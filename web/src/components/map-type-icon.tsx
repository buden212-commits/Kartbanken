import type { ReactElement } from "react";
import { coerceAreaType, type AreaType, AREA_TYPE_LABELS } from "@/lib/maps/area-types";

type IconProps = {
  className?: string;
};

function HouseIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={className}>
      <path
        d="M3.5 9.2 10 3.5l6.5 5.7V16a1 1 0 0 1-1 1h-3.75v-4.25h-3.5V17H4.5a1 1 0 0 1-1-1V9.2Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BikeIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={className}>
      <circle cx="5.25" cy="13.25" r="2.6" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="14.75" cy="13.25" r="2.6" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M8.2 13.1 10.1 7.4h3.4M10.1 7.4 7.35 5.6H5.7M10.15 13.15 12.4 8.85h2.85"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SkiIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={className}>
      <path
        d="M6.2 16.7c-.15.7.35 1.3 1.05 1.3h.15c.45 0 .8-.3.9-.75L9.7 7.4c.2-1.05-.35-1.7-1.15-2.05C7.4 4.85 6.7 5.4 6.55 6.2L6.2 16.7Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M13.8 16.7c.15.7-.35 1.3-1.05 1.3h-.15c-.45 0-.8-.3-.9-.75L10.3 7.4c-.2-1.05.35-1.7 1.15-2.05.95-.5 1.65.05 1.8.85L13.8 16.7Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M7.15 10.4h2.1M10.75 10.4h2.1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TreeIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={className}>
      <path
        d="M10 2.4 14.4 8H12.3L15.6 13H11.2v4.4H8.8V13H4.4L7.7 8H5.6L10 2.4Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const ICONS: Record<AreaType, (props: IconProps) => ReactElement> = {
  SPRINT: HouseIcon,
  MTBO: BikeIcon,
  SKIDO: SkiIcon,
  ORIENTEERING: TreeIcon,
};

type MapTypeIconProps = {
  areaType?: string | null;
  className?: string;
};

export function MapTypeIcon({ areaType, className }: MapTypeIconProps) {
  const type = coerceAreaType(areaType);
  const Icon = ICONS[type];
  return (
    <span
      title={AREA_TYPE_LABELS[type]}
      aria-hidden="true"
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-slate-700"
    >
      <Icon className={className ?? "h-5 w-5"} />
    </span>
  );
}
