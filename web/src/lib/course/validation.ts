import {
  getCourseSymbol,
  isValidSymbolNr,
  symbolAllowsGeometry,
} from "./symbols";
import {
  CourseObjectType,
  type CourseGeometry,
  type CourseObjectInput,
  type CourseObjectTypeValue,
} from "./types";

export const COURSE_MAX_OBJECTS = Number(process.env.COURSE_MAX_OBJECTS ?? 500);

function validateCutouts(value: unknown): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value)) return false;
  if (value.length > 4) return false;
  return value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const r = item as Record<string, unknown>;
    const angleRad = Number(r.angleRad);
    if (!Number.isFinite(angleRad)) return false;
    if (r.spanRad === undefined) return true;
    const spanRad = Number(r.spanRad);
    return Number.isFinite(spanRad) && spanRad > 0 && spanRad <= Math.PI;
  });
}

function validateLegGaps(value: unknown, max: number): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value)) return false;
  if (value.length > max) return false;
  return value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const r = item as Record<string, unknown>;
    const distance = Number(r.distance);
    const length = Number(r.length);
    return (
      Number.isFinite(distance) &&
      distance >= 0 &&
      Number.isFinite(length) &&
      length > 0
    );
  });
}

export function validateGeometry(
  objectType: CourseObjectTypeValue,
  geometry: unknown,
): geometry is CourseGeometry {
  if (!geometry || typeof geometry !== "object") return false;
  const g = geometry as Record<string, unknown>;

  if (objectType === CourseObjectType.POINT || objectType === CourseObjectType.TEXT) {
    if (g.type !== "Point" || !Array.isArray(g.coordinates)) return false;
    const [x, y] = g.coordinates as number[];
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (!validateCutouts(g.cutouts)) return false;
    if (!validateLegGaps(g.legGaps, 4)) return false;
    return true;
  }

  if (objectType === CourseObjectType.LINE) {
    if (g.type !== "LineString" || !Array.isArray(g.coordinates)) return false;
    const coordsOk = (g.coordinates as unknown[]).every(
      (c) =>
        Array.isArray(c) &&
        c.length >= 2 &&
        Number.isFinite(c[0]) &&
        Number.isFinite(c[1]),
    );
    if (!coordsOk) return false;
    return validateLegGaps(g.gaps, 8);
  }

  if (objectType === CourseObjectType.AREA) {
    if (g.type !== "Polygon" || !Array.isArray(g.coordinates)) return false;
    const ring = (g.coordinates as unknown[])[0];
    if (!Array.isArray(ring) || ring.length < 4) return false;
    return ring.every(
      (c) =>
        Array.isArray(c) &&
        c.length >= 2 &&
        Number.isFinite(c[0]) &&
        Number.isFinite(c[1]),
    );
  }

  return false;
}

export function validateCourseObjectInput(
  input: unknown,
  index: number,
): { ok: true; value: CourseObjectInput } | { ok: false; error: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, error: `Objekt ${index + 1}: ogiltigt format` };
  }

  const record = input as Record<string, unknown>;
  const symbolNr = Number(record.symbolNr);
  if (!isValidSymbolNr(symbolNr)) {
    return { ok: false, error: `Objekt ${index + 1}: symbolNr måste vara 700–709` };
  }

  const objectType = record.objectType;
  if (
    objectType !== CourseObjectType.POINT &&
    objectType !== CourseObjectType.LINE &&
    objectType !== CourseObjectType.AREA &&
    objectType !== CourseObjectType.TEXT
  ) {
    return { ok: false, error: `Objekt ${index + 1}: ogiltig objectType` };
  }

  const sym = getCourseSymbol(symbolNr)!;
  const geoKind =
    objectType === CourseObjectType.POINT
      ? "point"
      : objectType === CourseObjectType.LINE
        ? "line"
        : objectType === CourseObjectType.AREA
          ? "area"
          : "text";

  if (!symbolAllowsGeometry(symbolNr, geoKind)) {
    return {
      ok: false,
      error: `Objekt ${index + 1}: symbol ${symbolNr} (${sym.label}) tillåter inte ${geoKind}`,
    };
  }

  const geometry = record.geometry;
  if (!validateGeometry(objectType, geometry)) {
    return { ok: false, error: `Objekt ${index + 1}: ogiltig geometri` };
  }

  const sortOrder = Number(record.sortOrder);
  if (!Number.isInteger(sortOrder) || sortOrder < 0) {
    return { ok: false, error: `Objekt ${index + 1}: sortOrder måste vara heltal ≥ 0` };
  }

  const textContent =
    record.textContent === null || record.textContent === undefined
      ? null
      : String(record.textContent);

  if (objectType === CourseObjectType.TEXT && !textContent?.trim()) {
    return { ok: false, error: `Objekt ${index + 1}: textobjekt kräver textContent` };
  }

  return {
    ok: true,
    value: {
      id: typeof record.id === "string" ? record.id : undefined,
      symbolNr,
      objectType,
      geometry: geometry as CourseGeometry,
      textContent,
      sortOrder,
    },
  };
}

export function validateCourseName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 120) return null;
  return trimmed;
}
