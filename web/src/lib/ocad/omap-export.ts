/**
 * Export OCAD map data to OpenOrienteering Mapper native .omap (XML).
 *
 * Coordinate conversion matches Mapper's OCD importer:
 *   mapper_x = ocad_x * 10
 *   mapper_y = -ocad_y * 10
 * (OCAD paper units 1/100 mm → Mapper native 1/1000 mm, Y flipped.)
 *
 * Symbols are simplified (solid line / filled area / circle point / text) so
 * geometry and colors round-trip well; complex dashes/structures may differ.
 */

import { formatOcadSymbolNumber } from "@/lib/ocad/layers";
import {
  extractOcadCrsInfo,
  isGeoreferencedCrs,
  type OcadCrsInfo,
} from "@/lib/ocad/crs";
import type { CropBbox } from "@/lib/ocad/ocad-export-shared";

const MAPPER_NS = "http://openorienteering.org/apps/mapper/xml/v2";
const MAPPER_XML_VERSION = 9;

/** Mapper MapCoord flags (dense format). */
const FLAG_CURVE_START = 1 << 0;
const FLAG_CLOSE_POINT = 1 << 1;
const FLAG_HOLE_POINT = 1 << 4;
const FLAG_DASH_POINT = 1 << 5;

type TdPolyLike = {
  0: number;
  1: number;
  xFlags?: number;
  yFlags?: number;
  isFirstBezier?: () => boolean;
  isSecondBezier?: () => boolean;
  isCornerPoint?: () => boolean;
  isFirstHolePoint?: () => boolean;
  isDashPoint?: () => boolean;
};

type OcadColor = {
  number: number;
  name?: string;
  cmyk?: number[];
  rgbArray?: Uint8ClampedArray | number[];
};

type OcadSymbol = {
  symNum: number;
  type: number;
  description?: string;
  number?: string;
  colors?: number[];
  status?: number;
  isHidden?: () => boolean;
  // point
  elements?: Array<{ type?: number; color?: number; diameter?: number; lineWidth?: number }>;
  // line
  lineColor?: number;
  lineWidth?: number;
  mainLength?: number;
  mainGap?: number;
  // area
  fillColor?: number;
  fillOn?: boolean;
  hatchMode?: number;
  hatchColor?: number;
  hatchLineWidth?: number;
  hatchDist?: number;
  hatchAngle1?: number;
  // text
  fontName?: string;
  fontColor?: number;
  fontSize?: number;
  weight?: number;
  italic?: boolean;
  lineSpace?: number;
};

type OcadObject = {
  sym: number;
  otp?: number;
  objType?: number;
  ang?: number;
  text?: string;
  coordinates: TdPolyLike[];
  objIndex?: { status?: number; _index?: number; rc?: { minX?: number; minY?: number; maxX?: number; maxY?: number } };
};

export type OmapExportOcadFile = {
  header: { version: number };
  colors: Array<OcadColor | undefined | null>;
  symbols: OcadSymbol[];
  objects: OcadObject[];
  getCrs: () => {
    easting?: number;
    northing?: number;
    scale?: number;
    grivation?: number;
    code?: number;
    name?: string | null;
  } | null;
  getBounds?: () => [number, number, number, number];
};

export type BuildOmapOptions = {
  bbox?: CropBbox;
  /** Object indices to keep (from cropOcadBuffer). If omitted, uses bbox or all active. */
  keptObjectIndices?: number[];
  notes?: string;
};

export type BuildOmapResult = {
  xml: string;
  objectCount: number;
  symbolCount: number;
  colorCount: number;
  warnings: string[];
};

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function ocadLenToMapper(units: number): number {
  return Math.round(Number(units) * 10);
}

function ocadAngleToRad(ang: number | undefined): number {
  if (ang == null || !Number.isFinite(ang)) return 0;
  // OCAD: tenths of a degree, counterclockwise
  const tenths = ((Math.round(ang) % 3600) + 3600) % 3600;
  return (tenths * 0.1 * Math.PI) / 180;
}

function ocadFontSizeToMapper(fontSize: number | undefined): number {
  // OCAD fontSize is tenths of a point → Mapper 1/1000 mm
  const tenths = Number(fontSize);
  if (!Number.isFinite(tenths) || tenths <= 0) return 4233; // ~12 pt
  return Math.max(1, Math.round((100 * tenths * 25.4) / 72));
}

function rgb01(rgb: Uint8ClampedArray | number[] | undefined, i: number): string {
  if (!rgb || rgb[i] == null) return "0";
  return (Number(rgb[i]) / 255).toFixed(3);
}

function cmyk01(cmyk: number[] | undefined, i: number): string {
  const v = cmyk?.[i];
  if (v == null || !Number.isFinite(v)) return "0";
  // ocad2geojson stores 0–100 or 0–1 depending on source; normalize
  const n = v > 1 ? v / 100 : v;
  return Math.max(0, Math.min(1, n)).toFixed(3);
}

function objectBbox(obj: OcadObject): CropBbox | null {
  const coords = obj.coordinates;
  if (!coords?.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of coords) {
    const x = Number(c[0]);
    const y = Number(c[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!(maxX >= minX) || !(maxY >= minY)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function bboxOverlaps(a: CropBbox, b: CropBbox): boolean {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
}

function isActiveObject(obj: OcadObject): boolean {
  const status = obj.objIndex?.status;
  if (status == null) return true;
  return status > 0 && status < 3;
}

function polyFlag(p: TdPolyLike): { firstBezier: boolean; hole: boolean; dash: boolean; corner: boolean } {
  if (typeof p.isFirstBezier === "function") {
    return {
      firstBezier: !!p.isFirstBezier(),
      hole: !!p.isFirstHolePoint?.(),
      dash: !!p.isDashPoint?.() || !!p.isCornerPoint?.(),
      corner: !!p.isCornerPoint?.(),
    };
  }
  const xFlags = p.xFlags ?? 0;
  const yFlags = p.yFlags ?? 0;
  return {
    firstBezier: !!(xFlags & 0x01),
    hole: !!(yFlags & 0x02),
    dash: !!(yFlags & 0x08) || !!(yFlags & 0x01),
    corner: !!(yFlags & 0x01),
  };
}

function convertCoords(coords: TdPolyLike[], isArea: boolean): string {
  if (!coords.length) return "";
  const n = coords.length;
  const flags = new Array<number>(n).fill(0);

  for (let i = 0; i < n; i++) {
    const f = polyFlag(coords[i]!);
    // Mapper: CurveStart is set on the vertex *before* the first Bezier control
    if (f.firstBezier && i > 0) flags[i - 1]! |= FLAG_CURVE_START;
    if (f.dash || f.corner) flags[i]! |= FLAG_DASH_POINT;
    // Hole flag on OCAD point means previous vertex ends the ring
    if (f.hole && isArea && i > 0) flags[i - 1]! |= FLAG_HOLE_POINT;
  }

  if (isArea && n > 0) {
    flags[n - 1]! |= FLAG_CLOSE_POINT | FLAG_HOLE_POINT;
  }

  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const c = coords[i]!;
    const x = ocadLenToMapper(c[0]);
    const y = ocadLenToMapper(-c[1]);
    const fl = flags[i]!;
    parts.push(fl ? `${x} ${y} ${fl}` : `${x} ${y}`);
  }
  return parts.join(";") + ";";
}

function resolveColorIndex(
  colorNum: number | undefined,
  colorMap: Map<number, number>,
): number {
  if (colorNum == null || colorNum < 0) return -1;
  return colorMap.get(colorNum) ?? -1;
}

function buildColorTable(ocadFile: OmapExportOcadFile): {
  xml: string;
  colorMap: Map<number, number>;
  count: number;
} {
  const colorMap = new Map<number, number>();
  const entries: OcadColor[] = [];
  for (const c of ocadFile.colors) {
    if (!c || typeof c.number !== "number") continue;
    entries.push(c);
  }
  entries.sort((a, b) => a.number - b.number);

  const lines: string[] = [];
  lines.push(`<colors count="${entries.length}">`);
  entries.forEach((c, i) => {
    colorMap.set(c.number, i);
    const name = esc(c.name?.trim() || `Color ${c.number}`);
    lines.push(
      `<color priority="${i}" name="${name}" c="${cmyk01(c.cmyk, 0)}" m="${cmyk01(c.cmyk, 1)}" y="${cmyk01(c.cmyk, 2)}" k="${cmyk01(c.cmyk, 3)}" opacity="1">` +
        `<cmyk method="custom"/>` +
        `<rgb method="custom" r="${rgb01(c.rgbArray, 0)}" g="${rgb01(c.rgbArray, 1)}" b="${rgb01(c.rgbArray, 2)}"/>` +
        `</color>`,
    );
  });
  lines.push(`</colors>`);
  return { xml: lines.join("\n"), colorMap, count: entries.length };
}

function symbolCode(sym: OcadSymbol): string {
  if (sym.number && /^\d/.test(sym.number)) return esc(sym.number);
  return esc(formatOcadSymbolNumber(sym.symNum));
}

function writePointSymbol(sym: OcadSymbol, id: number, colorMap: Map<number, number>): string {
  const colorFromEls = sym.elements?.find((e) => e.color != null && e.color >= 0)?.color;
  const color =
    resolveColorIndex(colorFromEls, colorMap) >= 0
      ? resolveColorIndex(colorFromEls, colorMap)
      : resolveColorIndex(sym.colors?.[0], colorMap);
  const diamEl = sym.elements?.find((e) => e.diameter && e.diameter > 0);
  const radius = Math.max(200, ocadLenToMapper((diamEl?.diameter ?? 50) / 2));
  const name = esc(sym.description?.trim() || `Point ${symbolCode(sym)}`);
  return (
    `<symbol type="1" id="${id}" code="${symbolCode(sym)}" name="${name}">` +
    `<point_symbol inner_radius="${radius}" inner_color="${color}" outer_width="0" outer_color="-1" elements="0"/>` +
    `</symbol>`
  );
}

function writeLineSymbol(sym: OcadSymbol, id: number, colorMap: Map<number, number>): string {
  const color = resolveColorIndex(sym.lineColor ?? sym.colors?.[0], colorMap);
  const width = Math.max(1, ocadLenToMapper(sym.lineWidth ?? 10));
  const name = esc(sym.description?.trim() || `Line ${symbolCode(sym)}`);
  const segment = Math.max(width * 4, ocadLenToMapper(sym.mainLength ?? 400));
  const breakLen = Math.max(0, ocadLenToMapper(sym.mainGap ?? 0));
  const dashed = breakLen > 0;
  return (
    `<symbol type="2" id="${id}" code="${symbolCode(sym)}" name="${name}">` +
    `<line_symbol color="${color}" line_width="${width}" minimum_length="0" join_style="1" cap_style="1" ` +
    `pointed_cap_length="${Math.round(width)}" segment_length="${segment}" end_length="0" ` +
    `show_at_least_one_symbol="true" minimum_mid_symbol_count="0" minimum_mid_symbol_count_when_closed="0" ` +
    `dash_length="${dashed ? segment : 4000}" break_length="${dashed ? breakLen : 1000}" ` +
    `dashes_in_group="1" in_group_break_length="500" mid_symbols_per_spot="1" mid_symbol_distance="0"/>` +
    `</symbol>`
  );
}

function writeAreaSymbol(sym: OcadSymbol, id: number, colorMap: Map<number, number>): string {
  const fillOn = sym.fillOn !== false;
  const fill = fillOn ? resolveColorIndex(sym.fillColor ?? sym.colors?.[0], colorMap) : -1;
  const name = esc(sym.description?.trim() || `Area ${symbolCode(sym)}`);
  let patterns = "";
  let patternCount = 0;
  if ((sym.hatchMode ?? 0) > 0 && (sym.hatchColor ?? -1) >= 0) {
    const hc = resolveColorIndex(sym.hatchColor, colorMap);
    const hw = Math.max(1, ocadLenToMapper(sym.hatchLineWidth ?? 10));
    const hd = Math.max(hw * 2, ocadLenToMapper(sym.hatchDist ?? 100));
    const ang = ocadAngleToRad(sym.hatchAngle1);
    patterns +=
      `<pattern type="1" angle="${ang.toFixed(6)}" rotatable="false" line_spacing="${hd}" ` +
      `line_offset="0" offset_along_line="0" color="${hc}" line_width="${hw}"/>`;
    patternCount = 1;
  }
  return (
    `<symbol type="4" id="${id}" code="${symbolCode(sym)}" name="${name}">` +
    `<area_symbol inner_color="${fill}" min_area="0" patterns="${patternCount}">${patterns}</area_symbol>` +
    `</symbol>`
  );
}

function writeTextSymbol(sym: OcadSymbol, id: number, colorMap: Map<number, number>): string {
  const color = resolveColorIndex(sym.fontColor ?? sym.colors?.[0], colorMap);
  const size = ocadFontSizeToMapper(sym.fontSize);
  const family = esc(sym.fontName?.trim() || "Arial");
  const name = esc(sym.description?.trim() || `Text ${symbolCode(sym)}`);
  const bold = (sym.weight ?? 400) >= 700 ? ' bold="true"' : "";
  const italic = sym.italic ? ' italic="true"' : "";
  const lineSpacing = Number.isFinite(sym.lineSpace) ? Number(sym.lineSpace) / 100 : 1;
  return (
    `<symbol type="8" id="${id}" code="${symbolCode(sym)}" name="${name}">` +
    `<text_symbol icon_text="">` +
    `<font family="${family}" size="${size}"${bold}${italic}/>` +
    `<text color="${color}" line_spacing="${lineSpacing}" paragraph_spacing="0" character_spacing="0" kerning="true"/>` +
    `</text_symbol></symbol>`
  );
}

function writeSymbol(sym: OcadSymbol, id: number, colorMap: Map<number, number>): string | null {
  if (sym.isHidden?.()) return null;
  // status 2 = hidden in some OCAD versions
  if (sym.status === 2) return null;
  switch (sym.type) {
    case 1:
      return writePointSymbol(sym, id, colorMap);
    case 2:
    case 6: // line text → treat as line for geometry; text objects use text symbols
      return writeLineSymbol(sym, id, colorMap);
    case 3:
    case 7: // rectangle → area-like
      return writeAreaSymbol(sym, id, colorMap);
    case 4:
      return writeTextSymbol(sym, id, colorMap);
    default:
      return null;
  }
}

function objectTypeForSymbol(sym: OcadSymbol | undefined, obj: OcadObject): number {
  // Mapper: 0=point, 1=path, 4=text
  const otp = obj.otp ?? obj.objType ?? sym?.type ?? 0;
  if (sym?.type === 4 || otp === 4) return 4;
  if (sym?.type === 1 || otp === 1) return 0;
  return 1; // line / area path
}

function writeObject(
  obj: OcadObject,
  symbolId: number,
  sym: OcadSymbol | undefined,
): string | null {
  const coords = obj.coordinates;
  if (!coords?.length) return null;
  const mapperType = objectTypeForSymbol(sym, obj);
  const isArea = sym?.type === 3 || sym?.type === 7 || obj.otp === 3;
  const coordStr = convertCoords(coords, isArea);
  const rot = ocadAngleToRad(obj.ang);

  if (mapperType === 4) {
    const text = esc(obj.text ?? "");
    const rotAttr = rot ? ` rotation="${rot.toFixed(6)}"` : ` rotation="0"`;
    return (
      `<object type="4" symbol="${symbolId}"${rotAttr} h_align="1" v_align="2">` +
      `<coords count="${coords.length}">${coordStr}</coords>` +
      `<text>${text}</text></object>`
    );
  }

  if (mapperType === 0) {
    const rotAttr = rot ? ` rotation="${rot.toFixed(6)}"` : "";
    return (
      `<object type="0" symbol="${symbolId}"${rotAttr}>` +
      `<coords count="1">${coordStr}</coords></object>`
    );
  }

  return (
    `<object type="1" symbol="${symbolId}">` +
    `<coords count="${coords.length}">${coordStr}</coords></object>`
  );
}

function writeGeoreferencing(crs: OcadCrsInfo | null, scaleFallback: number): string {
  const scale = crs?.scale && crs.scale > 0 ? Math.round(crs.scale) : scaleFallback;
  if (!isGeoreferencedCrs(crs)) {
    return `<georeferencing scale="${scale}"><projected_crs id="Local"/></georeferencing>`;
  }

  const spec = epsgToProj4(crs.epsg);
  const grivationDeg = ((crs.grivation * 180) / Math.PI).toFixed(6);
  return (
    `<georeferencing scale="${scale}" declination="0" grivation="${grivationDeg}">` +
    `<projected_crs id="EPSG:${crs.epsg}">` +
    (spec ? `<spec language="PROJ.4">${esc(spec)}</spec>` : "") +
    `<ref_point x="${crs.easting.toFixed(6)}" y="${crs.northing.toFixed(6)}"/>` +
    `</projected_crs>` +
    `<geographic_crs id="Geographic coordinates">` +
    `<spec language="PROJ.4">+proj=latlong +datum=WGS84</spec>` +
    `</geographic_crs>` +
    `</georeferencing>`
  );
}

function epsgToProj4(epsg: number): string | null {
  // Subset matching crs.ts — Mapper accepts PROJ.4 specs.
  const defs: Record<number, string> = {
    3006: "+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
    3007: "+proj=tmerc +lat_0=0 +lon_0=12 +k=1 +x_0=150000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
    3008: "+proj=tmerc +lat_0=0 +lon_0=13.5 +k=1 +x_0=150000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
    3009: "+proj=tmerc +lat_0=0 +lon_0=15 +k=1 +x_0=150000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
    3010: "+proj=tmerc +lat_0=0 +lon_0=16.5 +k=1 +x_0=150000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
    3011: "+proj=tmerc +lat_0=0 +lon_0=18 +k=1 +x_0=150000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
    25832: "+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
    25833: "+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
    25834: "+proj=utm +zone=34 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
    32632: "+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs",
    32633: "+proj=utm +zone=33 +datum=WGS84 +units=m +no_defs",
    32634: "+proj=utm +zone=34 +datum=WGS84 +units=m +no_defs",
  };
  return defs[epsg] ?? `+init=epsg:${epsg}`;
}

/**
 * Build an OpenOrienteering Mapper .omap XML document from a parsed OCAD file.
 */
export function buildOmapXml(
  ocadFile: OmapExportOcadFile,
  options: BuildOmapOptions = {},
): BuildOmapResult {
  const warnings: string[] = [
    "Symboler är förenklade (streck/strukturer/sammansatta punkter kan skilja sig från OCAD).",
  ];

  const keptSet =
    options.keptObjectIndices != null
      ? new Set(options.keptObjectIndices)
      : null;

  const objects = ocadFile.objects.filter((obj) => {
    if (!isActiveObject(obj)) return false;
    const idx = obj.objIndex?._index;
    if (keptSet && idx != null && !keptSet.has(idx)) return false;
    if (keptSet && idx == null) return false;
    if (!keptSet && options.bbox) {
      const bb = objectBbox(obj);
      if (!bb || !bboxOverlaps(bb, options.bbox)) return false;
    }
    return true;
  });

  const usedSymNums = new Set(objects.map((o) => o.sym));
  const symbols = ocadFile.symbols.filter((s) => usedSymNums.has(s.symNum));

  const { xml: colorsXml, colorMap, count: colorCount } = buildColorTable(ocadFile);

  const symbolIdBySymNum = new Map<number, number>();
  const symbolXmlParts: string[] = [];
  let nextId = 0;
  for (const sym of symbols) {
    const xml = writeSymbol(sym, nextId, colorMap);
    if (!xml) continue;
    symbolIdBySymNum.set(sym.symNum, nextId);
    symbolXmlParts.push(xml);
    nextId++;
  }

  // Fallback symbols for objects whose definition was skipped
  for (const obj of objects) {
    if (symbolIdBySymNum.has(obj.sym)) continue;
    const otp = obj.otp ?? obj.objType ?? 2;
    const fake: OcadSymbol = {
      symNum: obj.sym,
      type: otp === 1 ? 1 : otp === 3 ? 3 : otp === 4 ? 4 : 2,
      description: `Symbol ${formatOcadSymbolNumber(obj.sym)}`,
      lineColor: 0,
      lineWidth: 10,
      fillColor: 0,
      fillOn: true,
      fontColor: 0,
      fontSize: 120,
      colors: [...colorMap.keys()].slice(0, 1),
    };
    const xml = writeSymbol(fake, nextId, colorMap);
    if (xml) {
      symbolIdBySymNum.set(obj.sym, nextId);
      symbolXmlParts.push(xml);
      nextId++;
      warnings.push(`Saknad symboldefinition för ${formatOcadSymbolNumber(obj.sym)} — skapade enkel ersättning.`);
    }
  }

  const objectXmlParts: string[] = [];
  const symByNum = new Map(ocadFile.symbols.map((s) => [s.symNum, s]));
  for (const obj of objects) {
    const sid = symbolIdBySymNum.get(obj.sym);
    if (sid == null) continue;
    const xml = writeObject(obj, sid, symByNum.get(obj.sym));
    if (xml) objectXmlParts.push(xml);
  }

  const crsInfo = extractOcadCrsInfo(ocadFile.getCrs());
  const scaleFallback = crsInfo?.scale && crsInfo.scale > 0 ? Math.round(crsInfo.scale) : 10000;
  const notes = esc(
    options.notes?.trim() ||
      "Exporterad från Kartbanken till OpenOrienteering Mapper (.omap). Symboler är förenklade.",
  );

  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<map xmlns="${MAPPER_NS}" version="${MAPPER_XML_VERSION}">`,
    `<notes>${notes}</notes>`,
    writeGeoreferencing(crsInfo, scaleFallback),
    colorsXml,
    `<barrier version="6" required="0.6.0">`,
    `<symbols count="${symbolXmlParts.length}">`,
    ...symbolXmlParts,
    `</symbols>`,
    `<parts count="1" current="0">`,
    `<part name="default part"><objects count="${objectXmlParts.length}">`,
    ...objectXmlParts,
    `</objects></part>`,
    `</parts>`,
    `<templates count="0" first_front_template="0">`,
    `<defaults use_meters_per_pixel="true" meters_per_pixel="0" dpi="0" scale="0"/>`,
    `</templates>`,
    `<view>`,
    `<grid color="#80646464" display="0" alignment="0" additional_rotation="0" unit="1" h_spacing="500" v_spacing="500" h_offset="0" v_offset="0" snapping_enabled="true"/>`,
    `<map_view zoom="1" position_x="0" position_y="0"><map opacity="1" visible="true"/><templates count="0"/></map_view>`,
    `</view>`,
    `</barrier>`,
    `</map>`,
    ``,
  ].join("\n");

  return {
    xml,
    objectCount: objectXmlParts.length,
    symbolCount: symbolXmlParts.length,
    colorCount,
    warnings,
  };
}
