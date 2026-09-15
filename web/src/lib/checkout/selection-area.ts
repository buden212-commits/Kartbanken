import { mapUnitsToMeters } from "@/lib/ocad/crs";
import { bboxFromGeometry } from "./overlap";
import {
  CheckoutSelectionType,
  type CheckoutSelectionGeometry,
  type PolygonRing,
} from "./types";

/** Max area for admin field-edit checkout (1 km²). */
export const MAX_FIELD_EDIT_AREA_M2 = 1_000_000;

function metersPerMapUnit(scale: number): number {
  return mapUnitsToMeters(1, scale);
}

function bboxAreaM2(
  bbox: { minX: number; minY: number; maxX: number; maxY: number },
  scale: number,
): number {
  const mpu = metersPerMapUnit(scale);
  const w = (bbox.maxX - bbox.minX) * mpu;
  const h = (bbox.maxY - bbox.minY) * mpu;
  return w * h;
}

function polygonAreaMapUnits(ring: PolygonRing): number {
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length;
    area += ring[i]![0] * ring[j]![1];
    area -= ring[j]![0] * ring[i]![1];
  }
  return Math.abs(area / 2);
}

function polygonAreaM2(ring: PolygonRing, scale: number): number {
  const mapArea = polygonAreaMapUnits(ring);
  const mpu = metersPerMapUnit(scale);
  return mapArea * mpu * mpu;
}

export function selectionAreaM2(
  geometry: CheckoutSelectionGeometry,
  scale: number,
): number {
  if (geometry.type === CheckoutSelectionType.BBOX) {
    return bboxAreaM2(geometry.bbox, scale);
  }
  return polygonAreaM2(geometry.ring, scale);
}

export function formatAreaKm2(areaM2: number): string {
  return (areaM2 / 1_000_000).toFixed(2);
}

export function validateFieldEditArea(
  geometry: CheckoutSelectionGeometry,
  scale: number,
): string | null {
  const area = selectionAreaM2(geometry, scale);
  if (area > MAX_FIELD_EDIT_AREA_M2) {
    return `Området är ${formatAreaKm2(area)} km² — max 1 km² tillåts för fältredigering`;
  }
  if (!(area > 0)) {
    return "Området måste ha en positiv yta";
  }
  return null;
}

/** Live feedback while drawing (uses bbox for polygon until ring is closed). */
export function selectionAreaM2FromPartial(
  geometry: CheckoutSelectionGeometry,
  scale: number,
): number {
  if (geometry.type === CheckoutSelectionType.POLYGON && geometry.ring.length >= 3) {
    return polygonAreaM2(geometry.ring, scale);
  }
  return bboxAreaM2(bboxFromGeometry(geometry), scale);
}
