import proj4 from "proj4";

/** OCAD paper units: 1/100 mm. Convert to meters via scale. */
const HUNDREDS_MM_TO_METER = 1 / (100 * 1000);

export type OcadCrsInfo = {
  easting: number;
  northing: number;
  scale: number;
  /** Grivation in radians */
  grivation: number;
  epsg: number;
  name: string | null;
};

/** Minimal CRS definitions used by Swedish (and nearby) orienteering maps. */
const EPSG_DEFS: Record<number, string> = {
  4326: "+proj=longlat +datum=WGS84 +no_defs",
  3006: "+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
  3007: "+proj=tmerc +lat_0=0 +lon_0=12 +k=1 +x_0=150000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
  3008: "+proj=tmerc +lat_0=0 +lon_0=13.5 +k=1 +x_0=150000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
  3009: "+proj=tmerc +lat_0=0 +lon_0=15 +k=1 +x_0=150000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
  3010: "+proj=tmerc +lat_0=0 +lon_0=16.5 +k=1 +x_0=150000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
  3011: "+proj=tmerc +lat_0=0 +lon_0=18 +k=1 +x_0=150000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
  3012: "+proj=tmerc +lat_0=0 +lon_0=14.25 +k=1 +x_0=150000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
  3013: "+proj=tmerc +lat_0=0 +lon_0=15.75 +k=1 +x_0=150000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
  3014: "+proj=tmerc +lat_0=0 +lon_0=17.25 +k=1 +x_0=150000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
  3015: "+proj=tmerc +lat_0=0 +lon_0=18.75 +k=1 +x_0=150000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
  3016: "+proj=tmerc +lat_0=0 +lon_0=20.25 +k=1 +x_0=150000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
  3017: "+proj=tmerc +lat_0=0 +lon_0=21.75 +k=1 +x_0=150000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
  3018: "+proj=tmerc +lat_0=0 +lon_0=23.25 +k=1 +x_0=150000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
  3021: "+proj=tmerc +lat_0=0 +lon_0=15.808277777778 +k=1 +x_0=1500000 +y_0=0 +ellps=bessel +towgs84=414.1,41.3,603.1,-0.855,2.141,-7.023,0 +units=m +no_defs",
  25832: "+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
  25833: "+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
  25834: "+proj=utm +zone=34 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
  32632: "+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs",
  32633: "+proj=utm +zone=33 +datum=WGS84 +units=m +no_defs",
  32634: "+proj=utm +zone=34 +datum=WGS84 +units=m +no_defs",
};

let defsRegistered = false;

function ensureProjDefs(): void {
  if (defsRegistered) return;
  for (const [code, def] of Object.entries(EPSG_DEFS)) {
    proj4.defs(`EPSG:${code}`, def);
  }
  defsRegistered = true;
}

export function isGeoreferencedCrs(crs: OcadCrsInfo | null | undefined): crs is OcadCrsInfo {
  return (
    !!crs &&
    crs.epsg > 0 &&
    Number.isFinite(crs.easting) &&
    Number.isFinite(crs.northing) &&
    Number.isFinite(crs.scale) &&
    crs.scale > 0 &&
    crs.epsg in EPSG_DEFS
  );
}

export function supportsEpsg(epsg: number): boolean {
  return epsg > 0 && epsg in EPSG_DEFS;
}

export function extractOcadCrsInfo(crs: {
  easting?: number;
  northing?: number;
  scale?: number;
  grivation?: number;
  code?: number;
  name?: string | null;
} | null | undefined): OcadCrsInfo | null {
  if (!crs) return null;
  const easting = Number(crs.easting);
  const northing = Number(crs.northing);
  const scale = Number(crs.scale);
  const grivation = Number(crs.grivation);
  const epsg = Number(crs.code);
  if (![easting, northing, scale, epsg].every(Number.isFinite) || scale <= 0) {
    return {
      easting: Number.isFinite(easting) ? easting : 0,
      northing: Number.isFinite(northing) ? northing : 0,
      scale: Number.isFinite(scale) && scale > 0 ? scale : 15000,
      grivation: Number.isFinite(grivation) ? grivation : 0,
      epsg: Number.isFinite(epsg) ? epsg : 0,
      name: crs.name ?? null,
    };
  }
  return {
    easting,
    northing,
    scale,
    grivation: Number.isFinite(grivation) ? grivation : 0,
    epsg,
    name: crs.name ?? null,
  };
}

export function serializeOcadCrs(crs: OcadCrsInfo): string {
  return JSON.stringify(crs);
}

export function parseOcadCrsFromSvg(svgText: string): OcadCrsInfo | null {
  const match = svgText.match(/data-ocad-crs=["']([^"']*)["']/i);
  if (!match?.[1]) return null;
  try {
    const raw = JSON.parse(
      match[1]
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<"),
    ) as Partial<OcadCrsInfo>;
    if (
      typeof raw.easting !== "number" ||
      typeof raw.northing !== "number" ||
      typeof raw.scale !== "number" ||
      typeof raw.epsg !== "number"
    ) {
      return null;
    }
    return {
      easting: raw.easting,
      northing: raw.northing,
      scale: raw.scale,
      grivation: typeof raw.grivation === "number" ? raw.grivation : 0,
      epsg: raw.epsg,
      name: typeof raw.name === "string" ? raw.name : null,
    };
  } catch {
    return null;
  }
}

/** Convert meters on ground to OCAD paper coordinates. */
export function metersToMapUnits(meters: number, scale: number): number {
  return (meters / HUNDREDS_MM_TO_METER) / scale;
}

/** Convert OCAD paper coordinate distance to meters on the ground. */
export function mapUnitsToMeters(mapUnits: number, scale: number): number {
  return mapUnits * HUNDREDS_MM_TO_METER * scale;
}

function rotate(coord: [number, number], theta: number): [number, number] {
  if (!theta) return coord;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return [coord[0] * cos - coord[1] * sin, coord[0] * sin + coord[1] * cos];
}

/** Projected CRS meters → OCAD paper coordinates (inverse of ocad2geojson Crs.toProjectedCoord). */
export function projectedToMapCoord(
  easting: number,
  northing: number,
  crs: OcadCrsInfo,
): [number, number] {
  const map: [number, number] = [
    (easting - crs.easting) / HUNDREDS_MM_TO_METER / crs.scale,
    (northing - crs.northing) / HUNDREDS_MM_TO_METER / crs.scale,
  ];
  return rotate(map, crs.grivation);
}

/**
 * WGS84 lon/lat → OCAD paper coordinates.
 * Returns null if CRS is missing or unsupported.
 */
export function wgs84ToMapCoord(
  longitude: number,
  latitude: number,
  crs: OcadCrsInfo,
): [number, number] | null {
  if (!isGeoreferencedCrs(crs)) return null;
  ensureProjDefs();
  try {
    const [easting, northing] = proj4(`EPSG:4326`, `EPSG:${crs.epsg}`, [
      longitude,
      latitude,
    ]) as [number, number];
    if (!Number.isFinite(easting) || !Number.isFinite(northing)) return null;
    return projectedToMapCoord(easting, northing, crs);
  } catch {
    return null;
  }
}
