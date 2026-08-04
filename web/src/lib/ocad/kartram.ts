export const KARTRAM_SYMBOL_NUM = 850001;

/** Typical ISOM map-frame brown (saddle brown). */
export const KARTRAM_BORDER_COLOR = "#8B4513";

/** Default stroke width in OCAD units (0.5 mm at 1 unit = 0.01 mm). */
export const KARTRAM_STROKE_WIDTH_UNITS = 50;

export type KartramBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type KartramInfo =
  | { kind: "geometry"; bounds: KartramBounds }
  | { kind: "symbol" };

type OcadCoord = ArrayLike<number>;

type OcadKartramObject = {
  sym: number;
  coordinates?: OcadCoord[];
  objIndex?: {
    rc?: {
      min?: OcadCoord;
      max?: OcadCoord;
    };
  };
};

type OcadFileForKartram = {
  objects: ReadonlyArray<OcadKartramObject>;
  symbols: ReadonlyArray<{ symNum: number }>;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function boundsFromOcadRect(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  yFlip: number,
): KartramBounds {
  const x = Math.min(minX, maxX);
  const width = Math.abs(maxX - minX);
  const svgMinY = yFlip - Math.max(minY, maxY);
  const svgMaxY = yFlip - Math.min(minY, maxY);
  return {
    x,
    y: svgMinY,
    width,
    height: svgMaxY - svgMinY,
  };
}

function boundsFromObject(object: OcadKartramObject, yFlip: number): KartramBounds | null {
  const rc = object.objIndex?.rc;
  if (
    rc?.min &&
    rc?.max &&
    isFiniteNumber(rc.min[0]) &&
    isFiniteNumber(rc.min[1]) &&
    isFiniteNumber(rc.max[0]) &&
    isFiniteNumber(rc.max[1])
  ) {
    return boundsFromOcadRect(rc.min[0], rc.min[1], rc.max[0], rc.max[1], yFlip);
  }

  const coords = object.coordinates;
  if (!coords || coords.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const coord of coords) {
    const x = coord[0];
    const y = coord[1];
    if (!isFiniteNumber(x) || !isFiniteNumber(y)) continue;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return boundsFromOcadRect(minX, minY, maxX, maxY, yFlip);
}

function mergeKartramBounds(parts: KartramBounds[]): KartramBounds | null {
  if (parts.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const part of parts) {
    minX = Math.min(minX, part.x);
    minY = Math.min(minY, part.y);
    maxX = Math.max(maxX, part.x + part.width);
    maxY = Math.max(maxY, part.y + part.height);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/** Detect kartram from parsed OCAD data and convert bounds to SVG viewBox space. */
export function extractKartramFromOcad(
  ocadFile: OcadFileForKartram,
  yFlip: number,
): KartramInfo | null {
  const kartramObjects = ocadFile.objects.filter((obj) => obj.sym === KARTRAM_SYMBOL_NUM);
  const objectBounds = kartramObjects
    .map((obj) => boundsFromObject(obj, yFlip))
    .filter((bounds): bounds is KartramBounds => bounds != null);
  const mergedBounds = mergeKartramBounds(objectBounds);

  if (mergedBounds) {
    return { kind: "geometry", bounds: mergedBounds };
  }

  const hasSymbolDef = ocadFile.symbols.some((sym) => sym.symNum === KARTRAM_SYMBOL_NUM);
  if (hasSymbolDef || kartramObjects.length > 0) {
    return { kind: "symbol" };
  }

  return null;
}

function parseKartramBoundsAttribute(value: string): KartramBounds | null {
  const parts = value.trim().split(/\s+/).map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [x, y, width, height] = parts;
  if (width <= 0 || height <= 0) return null;
  return { x: x!, y: y!, width: width!, height: height! };
}

/** Read kartram metadata embedded in preview SVG (`data-ocad-kartram`). */
export function parseKartramFromSvg(svgText: string): KartramInfo | null {
  const match = svgText.match(/data-ocad-kartram=["']([^"']*)["']/i);
  if (!match?.[1]) return null;

  const raw = match[1].trim();
  if (raw === "symbol") return { kind: "symbol" };

  const bounds = parseKartramBoundsAttribute(raw);
  if (bounds) return { kind: "geometry", bounds };

  return null;
}

export function serializeKartramForSvg(info: KartramInfo): string {
  if (info.kind === "symbol") return "symbol";
  const { x, y, width, height } = info.bounds;
  return `${x} ${y} ${width} ${height}`;
}

export function resolveKartramBorderBounds(
  info: KartramInfo | null,
  fallbackBounds: KartramBounds,
): KartramBounds | null {
  if (!info) return null;
  if (info.kind === "geometry") return info.bounds;
  return fallbackBounds;
}

export function buildKartramBorderSvg(
  bounds: KartramBounds,
  options?: { strokeWidth?: number; cornerRadius?: number },
): string {
  const strokeWidth = options?.strokeWidth ?? KARTRAM_STROKE_WIDTH_UNITS;
  const cornerRadius =
    options?.cornerRadius ??
    Math.max(strokeWidth * 2, Math.min(bounds.width, bounds.height) * 0.025);
  const inset = strokeWidth / 2;

  return `<rect data-kartram-frame="true" x="${bounds.x + inset}" y="${bounds.y + inset}" width="${Math.max(0, bounds.width - strokeWidth)}" height="${Math.max(0, bounds.height - strokeWidth)}" rx="${cornerRadius}" ry="${cornerRadius}" fill="none" stroke="${KARTRAM_BORDER_COLOR}" stroke-width="${strokeWidth}"/>`;
}

export function buildKartramFrameMarkup(
  info: KartramInfo | null,
  fallbackBounds: KartramBounds,
): string {
  const bounds = resolveKartramBorderBounds(info, fallbackBounds);
  if (!bounds) return "";
  return `<g data-kartram-frame="true">\n${buildKartramBorderSvg(bounds)}\n</g>`;
}
