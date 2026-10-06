import { PDF_EXPORT_ROTATION_DEG } from "@/lib/ocad/map-export";

let cachedDeg: number | null = null;
let inflight: Promise<number> | null = null;

/** Fetch configured PDF export rotation (cached for the browser session). */
export async function fetchExportRotationDeg(): Promise<number> {
  if (cachedDeg != null) return cachedDeg;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await fetch("/api/settings/export-rotation");
      if (!res.ok) {
        cachedDeg = PDF_EXPORT_ROTATION_DEG;
        return cachedDeg;
      }
      const data = (await res.json()) as { exportRotationDeg?: unknown };
      const deg = Number(data.exportRotationDeg);
      cachedDeg = Number.isFinite(deg) ? Math.round(deg) : PDF_EXPORT_ROTATION_DEG;
      return cachedDeg;
    } catch {
      cachedDeg = PDF_EXPORT_ROTATION_DEG;
      return cachedDeg;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** Clear cache after admin saves a new value (same tab). */
export function clearExportRotationDegCache(): void {
  cachedDeg = null;
}
