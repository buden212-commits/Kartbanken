import { mapUnitsToMeters, metersToMapUnits } from "@/lib/ocad/crs";

export const GPS_TRACK_MIN_DISTANCE_M = 4;
export const GPS_TRACK_MAX_ACCURACY_M = 30;
export const GPS_TRACK_SIMPLIFY_TOLERANCE_M = 3;

export type GpsTrackSample = {
  mapCoord: [number, number];
  accuracyMeters: number;
};

export type GpsTrackProcessResult = {
  coordinates: [number, number][];
  rawPointCount: number;
  filteredPointCount: number;
  simplifiedPointCount: number;
  averageAccuracyMeters: number;
};

export type GpsTrackProcessOptions = {
  minDistanceM?: number;
  simplifyToleranceM?: number;
  mapScale: number;
};

export function mapCoordDistanceMeters(
  a: [number, number],
  b: [number, number],
  mapScale: number,
): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return mapUnitsToMeters(Math.hypot(dx, dy), mapScale);
}

export function shouldAcceptGpsSample(
  mapCoord: [number, number],
  accuracyMeters: number,
  lastSample: GpsTrackSample | null,
  options: { minDistanceM: number; maxAccuracyM: number; mapScale: number },
): boolean {
  if (!Number.isFinite(accuracyMeters) || accuracyMeters > options.maxAccuracyM) {
    return false;
  }
  if (!lastSample) return true;
  return (
    mapCoordDistanceMeters(lastSample.mapCoord, mapCoord, options.mapScale) >=
    options.minDistanceM
  );
}

function perpendicularDistanceMapUnits(
  point: [number, number],
  lineStart: [number, number],
  lineEnd: [number, number],
): number {
  const dx = lineEnd[0] - lineStart[0];
  const dy = lineEnd[1] - lineStart[1];
  if (dx === 0 && dy === 0) {
    return Math.hypot(point[0] - lineStart[0], point[1] - lineStart[1]);
  }
  const t =
    ((point[0] - lineStart[0]) * dx + (point[1] - lineStart[1]) * dy) /
    (dx * dx + dy * dy);
  const clamped = Math.max(0, Math.min(1, t));
  const projX = lineStart[0] + clamped * dx;
  const projY = lineStart[1] + clamped * dy;
  return Math.hypot(point[0] - projX, point[1] - projY);
}

/** Douglas–Peucker simplification; tolerance in map (paper) units. */
export function douglasPeucker(
  points: [number, number][],
  toleranceMapUnits: number,
): [number, number][] {
  if (points.length <= 2) return points.slice();
  if (!(toleranceMapUnits > 0)) return points.slice();

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack: [number, number][] = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    let maxDist = 0;
    let maxIndex = start;

    for (let i = start + 1; i < end; i++) {
      const dist = perpendicularDistanceMapUnits(points[i]!, points[start]!, points[end]!);
      if (dist > maxDist) {
        maxDist = dist;
        maxIndex = i;
      }
    }

    if (maxDist > toleranceMapUnits) {
      keep[maxIndex] = 1;
      stack.push([start, maxIndex], [maxIndex, end]);
    }
  }

  return points.filter((_, index) => keep[index]);
}

export function processGpsTrack(
  samples: GpsTrackSample[],
  options: GpsTrackProcessOptions,
): GpsTrackProcessResult | null {
  if (samples.length === 0) return null;

  const filtered = samples.map((sample) => sample.mapCoord);
  if (filtered.length < 2) return null;

  const toleranceM = options.simplifyToleranceM ?? GPS_TRACK_SIMPLIFY_TOLERANCE_M;
  const toleranceMapUnits = metersToMapUnits(toleranceM, options.mapScale);
  const simplified = douglasPeucker(filtered, toleranceMapUnits);
  if (simplified.length < 2) return null;

  const accuracySum = samples.reduce((sum, sample) => sum + sample.accuracyMeters, 0);

  return {
    coordinates: simplified,
    rawPointCount: samples.length,
    filteredPointCount: filtered.length,
    simplifiedPointCount: simplified.length,
    averageAccuracyMeters: accuracySum / samples.length,
  };
}
