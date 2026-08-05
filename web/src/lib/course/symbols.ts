/**
 * ISOM 2017-2 course planning symbols 700–709 — IOF overprint (purple/magenta).
 * Dimensions in mm at 1:15 000 map scale (OCAD units: 1 = 0.01 mm).
 */
import {
  COURSE_TEXT_ROTATION_DEG,
  courseTextRotationTransform,
} from "@/lib/ocad/map-export";
import type { CourseObjectTypeValue } from "./types";

export type CourseSymbolGeometry = "point" | "line" | "area" | "text";

/** IOF course overprint colour (Screened Magenta / lower purple). */
export const IOF_MAGENTA = "#FF00FF";

/** 1 mm on the printed map in OCAD coordinate units. */
export const OCAD_UNITS_PER_MM = 100;

export function mmToOcadUnits(mm: number): number {
  return mm * OCAD_UNITS_PER_MM;
}

/** Line width for course symbols and legs: 0.35 mm (ISOM 3.7). */
export const IOF_LINE_WIDTH = mmToOcadUnits(0.35);

/** Point/line symbol outline width: 0.35 mm. */
export const IOF_SYMBOL_STROKE = mmToOcadUnits(0.35);

/** 701 Start — equilateral triangle side length: 6.0 mm. */
export const IOF_START_TRIANGLE_SIDE = mmToOcadUnits(6);

/** 702 Map issue point — circle diameter 5.0 mm. */
export const IOF_MAP_ISSUE_RADIUS = mmToOcadUnits(2.5);

/** 703 Control point — circle diameter 6.0 mm. */
export const IOF_CONTROL_RADIUS = mmToOcadUnits(3);

/** 706 Finish — inner circle diameter 4.0 mm. */
export const IOF_FINISH_INNER_RADIUS = mmToOcadUnits(2);

/** 706 Finish — outer circle diameter 6.0 mm. */
export const IOF_FINISH_OUTER_RADIUS = mmToOcadUnits(3);

/** 704 Control number — Arial 4.0 mm cap height. */
export const IOF_CONTROL_NUMBER_SIZE = mmToOcadUnits(4);

/** 707 Marked route dash / gap lengths. */
export const IOF_MARKED_ROUTE_DASH = mmToOcadUnits(2);
export const IOF_MARKED_ROUTE_GAP = mmToOcadUnits(0.5);

/** 709 Out-of-bounds area cross-hatch spacing. */
export const IOF_OOB_HATCH_WIDTH = mmToOcadUnits(0.2);
export const IOF_OOB_HATCH_GAP = mmToOcadUnits(1.2);

export type CourseSymbolDef = {
  nr: number;
  label: string;
  geometryTypes: CourseSymbolGeometry[];
  isControl: boolean;
  color: string;
};

export const COURSE_SYMBOLS: CourseSymbolDef[] = [
  {
    nr: 700,
    label: "Övrig",
    geometryTypes: ["point", "line", "area", "text"],
    isControl: false,
    color: IOF_MAGENTA,
  },
  {
    nr: 701,
    label: "Start",
    geometryTypes: ["point"],
    isControl: false,
    color: IOF_MAGENTA,
  },
  {
    nr: 702,
    label: "Kartutlämning",
    geometryTypes: ["point"],
    isControl: false,
    color: IOF_MAGENTA,
  },
  {
    nr: 703,
    label: "Kontroll",
    geometryTypes: ["point"],
    isControl: true,
    color: IOF_MAGENTA,
  },
  {
    nr: 704,
    label: "Kontrollnummer",
    geometryTypes: ["text"],
    isControl: false,
    color: IOF_MAGENTA,
  },
  {
    nr: 705,
    label: "Banlinje",
    geometryTypes: ["line"],
    isControl: false,
    color: IOF_MAGENTA,
  },
  {
    nr: 706,
    label: "Mål",
    geometryTypes: ["point"],
    isControl: false,
    color: IOF_MAGENTA,
  },
  {
    nr: 707,
    label: "Markerad sträcka",
    geometryTypes: ["line"],
    isControl: false,
    color: IOF_MAGENTA,
  },
  {
    nr: 708,
    label: "Förbudslinje",
    geometryTypes: ["line"],
    isControl: false,
    color: IOF_MAGENTA,
  },
  {
    nr: 709,
    label: "Förbudsområde",
    geometryTypes: ["area"],
    isControl: false,
    color: IOF_MAGENTA,
  },
];

export const COURSE_SYMBOL_MIN = 700;
export const COURSE_SYMBOL_MAX = 709;

/** Symbols hidden from the editor palette (still valid for legacy saved courses). */
export const COURSE_PALETTE_EXCLUDED = new Set([700, 702, 708]);

/** Selectable symbols in the banläggning editor. */
export const COURSE_PALETTE_SYMBOLS = COURSE_SYMBOLS.filter(
  (s) => !COURSE_PALETTE_EXCLUDED.has(s.nr),
);

/** Point symbols connected by auto-drawn course legs (701 → 703 → 706). */
export const COURSE_LEG_SYMBOLS = new Set([701, 703, 706]);

export function getCourseSymbol(nr: number): CourseSymbolDef | undefined {
  return COURSE_SYMBOLS.find((s) => s.nr === nr);
}

export function isValidSymbolNr(nr: number): boolean {
  return nr >= COURSE_SYMBOL_MIN && nr <= COURSE_SYMBOL_MAX;
}

export function geometryTypeForSymbol(symbolNr: number): CourseSymbolGeometry | null {
  const sym = getCourseSymbol(symbolNr);
  return sym?.geometryTypes[0] ?? null;
}

export function objectTypeFromGeometry(
  geometry: CourseSymbolGeometry,
): CourseObjectTypeValue {
  switch (geometry) {
    case "point":
      return "POINT";
    case "line":
      return "LINE";
    case "area":
      return "AREA";
    case "text":
      return "TEXT";
  }
}

export function geometryTypeFromObjectType(
  objectType: CourseObjectTypeValue,
): CourseSymbolGeometry {
  switch (objectType) {
    case "POINT":
      return "point";
    case "LINE":
      return "line";
    case "AREA":
      return "area";
    case "TEXT":
      return "text";
  }
}

export function symbolAllowsGeometry(
  symbolNr: number,
  geometry: CourseSymbolGeometry,
): boolean {
  const sym = getCourseSymbol(symbolNr);
  return sym?.geometryTypes.includes(geometry) ?? false;
}

export function isControlSymbol(symbolNr: number): boolean {
  return getCourseSymbol(symbolNr)?.isControl ?? false;
}

export function parseControlSymbolNrs(envValue: string | undefined): number[] {
  if (!envValue?.trim()) {
    return COURSE_SYMBOLS.filter((s) => s.isControl).map((s) => s.nr);
  }
  return envValue
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && isValidSymbolNr(n));
}

/** Radius used to leave a gap between course legs and point symbols. */
export function getPointSymbolLegGap(symbolNr: number): number {
  switch (symbolNr) {
    case 701:
      return (Math.sqrt(3) / 3) * IOF_START_TRIANGLE_SIDE;
    case 702:
      return IOF_MAP_ISSUE_RADIUS;
    case 703:
      return IOF_CONTROL_RADIUS;
    case 706:
      return IOF_FINISH_OUTER_RADIUS;
    default:
      return IOF_CONTROL_RADIUS;
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type PointSymbolRenderOptions = {
  opacity?: number;
  selected?: boolean;
  controlNumber?: number;
  /** Angle (radians) for orienting start triangle toward next control. */
  headingRad?: number;
  textRotationDeg?: number;
};

/** Render a course point symbol at map coordinates (SVG user space). */
export function renderPointSymbolSvg(
  symbolNr: number,
  cx: number,
  cy: number,
  options?: PointSymbolRenderOptions,
): string {
  const color = getCourseSymbol(symbolNr)?.color ?? IOF_MAGENTA;
  const opacity = options?.opacity ?? 1;
  const stroke = color;
  const strokeW = options?.selected ? IOF_SYMBOL_STROKE * 1.4 : IOF_SYMBOL_STROKE;
  const fill = "none";

  let shape = "";

  switch (symbolNr) {
    case 701: {
      const side = IOF_START_TRIANGLE_SIDE;
      const h = (Math.sqrt(3) / 2) * side;
      const heading = options?.headingRad ?? -Math.PI / 2;
      const cos = Math.cos(heading);
      const sin = Math.sin(heading);
      const tip = rotatePoint(cx, cy + h * (2 / 3), cx, cy, cos, sin);
      const baseL = rotatePoint(cx - side / 2, cy - h / 3, cx, cy, cos, sin);
      const baseR = rotatePoint(cx + side / 2, cy - h / 3, cx, cy, cos, sin);
      shape = `<polygon points="${fmt(tip)} ${fmt(baseL)} ${fmt(baseR)}" fill="${fill}" stroke="${stroke}" stroke-opacity="${opacity}" stroke-width="${strokeW}" stroke-linejoin="round"/>`;
      break;
    }
    case 702:
      shape = `<circle cx="${cx}" cy="${cy}" r="${IOF_MAP_ISSUE_RADIUS}" fill="${fill}" stroke="${stroke}" stroke-opacity="${opacity}" stroke-width="${strokeW}"/>`;
      break;
    case 703:
      shape = `<circle cx="${cx}" cy="${cy}" r="${IOF_CONTROL_RADIUS}" fill="${fill}" stroke="${stroke}" stroke-opacity="${opacity}" stroke-width="${strokeW}"/>`;
      break;
    case 706:
      shape = `<circle cx="${cx}" cy="${cy}" r="${IOF_FINISH_OUTER_RADIUS}" fill="${fill}" stroke="${stroke}" stroke-opacity="${opacity}" stroke-width="${strokeW}"/>
<circle cx="${cx}" cy="${cy}" r="${IOF_FINISH_INNER_RADIUS}" fill="${fill}" stroke="${stroke}" stroke-opacity="${opacity}" stroke-width="${strokeW}"/>`;
      break;
    default: {
      const r = IOF_CONTROL_RADIUS * 0.75;
      shape = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-opacity="${opacity}" stroke-width="${strokeW}"/>`;
    }
  }

  const numberLabel =
    options?.controlNumber != null
      ? renderControlNumber(
          cx,
          cy,
          options.controlNumber,
          color,
          opacity,
          options.textRotationDeg,
        )
      : "";

  return `${shape}${numberLabel}`;
}

/** Default 704 position per ISOM — to the right of the control circle. */
export function defaultControlNumberGeoPoint(
  controlCoords: [number, number],
): [number, number] {
  const [cx, cy] = controlCoords;
  const offset = IOF_CONTROL_RADIUS + mmToOcadUnits(0.8);
  return [cx + offset, cy - mmToOcadUnits(0.5)];
}

function renderControlNumber(
  cx: number,
  cy: number,
  number: number,
  color: string,
  opacity: number,
  textRotationDeg = COURSE_TEXT_ROTATION_DEG,
): string {
  const offset = IOF_CONTROL_RADIUS + mmToOcadUnits(0.8);
  const x = cx + offset;
  const y = cy - mmToOcadUnits(0.5);
  return renderRotatedTextSvg(x, y, String(number), {
    color,
    opacity,
    fontSize: IOF_CONTROL_NUMBER_SIZE,
    textRotationDeg,
  });
}

function renderRotatedTextSvg(
  x: number,
  y: number,
  text: string,
  options: {
    color: string;
    opacity: number;
    fontSize: number;
    /** Omit for editor tilt; pass 0 for horizontal export text. */
    textRotationDeg?: number;
  },
): string {
  const rotation = courseTextRotationTransform(
    x,
    y,
    options.textRotationDeg === 0
      ? 0
      : (options.textRotationDeg ?? COURSE_TEXT_ROTATION_DEG),
  );
  const textMarkup = `<text x="${x}" y="${y}" fill="${options.color}" fill-opacity="${options.opacity}" font-size="${options.fontSize}" font-family="Arial, Helvetica, sans-serif" font-weight="normal" font-style="normal">${text}</text>`;
  if (!rotation) return textMarkup;
  return `<g transform="${rotation}">${textMarkup}</g>`;
}

function rotatePoint(
  px: number,
  py: number,
  cx: number,
  cy: number,
  cos: number,
  sin: number,
): [number, number] {
  const dx = px - cx;
  const dy = py - cy;
  return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
}

function fmt([x, y]: [number, number]): string {
  return `${x},${y}`;
}

export type LineSymbolRenderOptions = {
  opacity?: number;
  selected?: boolean;
};

/** Render a course line symbol (705/707/708). */
export function renderLineSymbolSvg(
  symbolNr: number,
  points: string,
  options?: LineSymbolRenderOptions,
): string {
  const color = getCourseSymbol(symbolNr)?.color ?? IOF_MAGENTA;
  const opacity = options?.opacity ?? 1;
  const strokeW = options?.selected ? IOF_LINE_WIDTH * 1.4 : IOF_LINE_WIDTH;

  let dashArray: string | undefined;
  switch (symbolNr) {
    case 707:
      dashArray = `${IOF_MARKED_ROUTE_DASH} ${IOF_MARKED_ROUTE_GAP}`;
      break;
    default:
      dashArray = undefined;
  }

  const dashAttr = dashArray ? ` stroke-dasharray="${dashArray}"` : "";
  return `<polyline points="${points}" fill="none" stroke="${color}" stroke-opacity="${opacity}" stroke-width="${strokeW}"${dashAttr}/>`;
}

export type AreaSymbolRenderOptions = {
  opacity?: number;
  selected?: boolean;
};

/** Render a course area symbol (709 out-of-bounds). */
export function renderAreaSymbolSvg(
  symbolNr: number,
  points: string,
  options?: AreaSymbolRenderOptions,
): string {
  const color = getCourseSymbol(symbolNr)?.color ?? IOF_MAGENTA;
  const opacity = options?.opacity ?? 1;
  const strokeW = options?.selected ? IOF_LINE_WIDTH * 1.4 : IOF_LINE_WIDTH;

  if (symbolNr === 709) {
    const id = `oob-${Math.random().toString(36).slice(2, 9)}`;
    return `<defs><pattern id="${id}" patternUnits="userSpaceOnUse" width="${IOF_OOB_HATCH_GAP}" height="${IOF_OOB_HATCH_GAP}" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="${IOF_OOB_HATCH_GAP}" stroke="${color}" stroke-width="${IOF_OOB_HATCH_WIDTH}"/></pattern></defs><polygon points="${points}" fill="url(#${id})" fill-opacity="${opacity}" stroke="${color}" stroke-opacity="${opacity}" stroke-width="${strokeW}"/>`;
  }

  return `<polygon points="${points}" fill="${color}" fill-opacity="${opacity * 0.2}" stroke="${color}" stroke-opacity="${opacity}" stroke-width="${strokeW}"/>`;
}

/** Compact SVG icon for the symbol palette (fixed 32×32 viewBox). */
export function renderSymbolIconSvg(symbolNr: number, size = 32): string {
  const cx = size / 2;
  const cy = size / 2;
  const scale = size / 16;
  const color = IOF_MAGENTA;
  const sw = 1.2;

  switch (symbolNr) {
    case 701: {
      const side = 6 * scale;
      const h = (Math.sqrt(3) / 2) * side;
      const tip = `${cx},${cy - h * (2 / 3)}`;
      const baseL = `${cx - side / 2},${cy + h / 3}`;
      const baseR = `${cx + side / 2},${cy + h / 3}`;
      return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg"><polygon points="${tip} ${baseL} ${baseR}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linejoin="round"/></svg>`;
    }
    case 702:
      return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg"><circle cx="${cx}" cy="${cy}" r="${2.5 * scale}" fill="none" stroke="${color}" stroke-width="${sw}"/></svg>`;
    case 703:
      return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg"><circle cx="${cx}" cy="${cy}" r="${3 * scale}" fill="none" stroke="${color}" stroke-width="${sw}"/></svg>`;
    case 704:
      return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg"><text x="${cx}" y="${cy + 1.5 * scale}" text-anchor="middle" fill="${color}" font-size="${6 * scale}" font-family="Arial,sans-serif">1</text></svg>`;
    case 705:
      return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg"><line x1="${4 * scale}" y1="${size - 4 * scale}" x2="${size - 4 * scale}" y2="${4 * scale}" stroke="${color}" stroke-width="${sw}"/></svg>`;
    case 706:
      return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg"><circle cx="${cx}" cy="${cy}" r="${3 * scale}" fill="none" stroke="${color}" stroke-width="${sw}"/><circle cx="${cx}" cy="${cy}" r="${2 * scale}" fill="none" stroke="${color}" stroke-width="${sw}"/></svg>`;
    case 707:
      return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg"><line x1="${4 * scale}" y1="${size - 4 * scale}" x2="${size - 4 * scale}" y2="${4 * scale}" stroke="${color}" stroke-width="${sw}" stroke-dasharray="${3 * scale} ${scale}"/></svg>`;
    case 708:
      return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg"><line x1="${3 * scale}" y1="${cy}" x2="${size - 3 * scale}" y2="${cy}" stroke="${color}" stroke-width="${sw}"/><line x1="${3 * scale}" y1="${cy + 4 * scale}" x2="${size - 3 * scale}" y2="${cy + 4 * scale}" stroke="${color}" stroke-width="${sw}"/></svg>`;
    case 709:
      return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="oob-icon" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" stroke="${color}" stroke-width="1"/></pattern></defs><rect x="${4 * scale}" y="${4 * scale}" width="${8 * scale}" height="${8 * scale}" fill="url(#oob-icon)" stroke="${color}" stroke-width="${sw}"/></svg>`;
    default:
      return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg"><circle cx="${cx}" cy="${cy}" r="${4 * scale}" fill="none" stroke="${color}" stroke-width="${sw}"/></svg>`;
  }
}

export function renderTextSymbolSvg(
  x: number,
  y: number,
  text: string,
  options?: {
    opacity?: number;
    selected?: boolean;
    symbolNr?: number;
    textRotationDeg?: number;
  },
): string {
  const color = IOF_MAGENTA;
  const opacity = options?.opacity ?? 1;
  const fontSize =
    options?.symbolNr === 704 ? IOF_CONTROL_NUMBER_SIZE : mmToOcadUnits(4);
  return renderRotatedTextSvg(x, y, escapeXml(text), {
    color,
    opacity,
    fontSize,
    textRotationDeg: options?.textRotationDeg,
  });
}
