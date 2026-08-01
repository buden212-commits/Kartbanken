import type { OcadObjectChange } from "./diff-types";

function isFinitePair(pair: unknown): pair is [number, number] {
  return (
    Array.isArray(pair) &&
    pair.length >= 2 &&
    typeof pair[0] === "number" &&
    typeof pair[1] === "number" &&
    Number.isFinite(pair[0]) &&
    Number.isFinite(pair[1])
  );
}

function isFiniteBbox(bbox: unknown): bbox is [number, number, number, number] {
  return (
    Array.isArray(bbox) &&
    bbox.length >= 4 &&
    bbox.every((v) => typeof v === "number" && Number.isFinite(v))
  );
}

export function getChangeCentroid(change: OcadObjectChange): [number, number] | null {
  if (isFinitePair(change.centroid)) return change.centroid;
  if (isFiniteBbox(change.bbox)) {
    const [minX, minY, maxX, maxY] = change.bbox;
    return [(minX + maxX) / 2, (minY + maxY) / 2];
  }
  return null;
}

export function formatChangeCentroid(change: OcadObjectChange): string {
  const centroid = getChangeCentroid(change);
  if (!centroid) return "—";
  return `(${centroid[0].toFixed(1)}, ${centroid[1].toFixed(1)})`;
}
