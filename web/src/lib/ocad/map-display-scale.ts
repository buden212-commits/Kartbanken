/** Nominal on-screen map scale from OCAD file scale and viewport zoom (1 = hela kartan). */
export const MIN_MAP_DISPLAY_SCALE = 100;

export function mapDisplayScale(ocadMapScale: number, zoom: number): number | null {
  if (!(ocadMapScale > 0) || !(zoom > 0)) return null;
  return ocadMapScale / zoom;
}

/** Max CSS zoom so nominal display scale does not go below MIN_MAP_DISPLAY_SCALE (e.g. 1:100). */
export function maxZoomForMapScale(ocadMapScale: number): number {
  if (!(ocadMapScale > 0)) return 150;
  return ocadMapScale / MIN_MAP_DISPLAY_SCALE;
}

export function formatMapDisplayScale(ocadMapScale: number, zoom: number): string {
  const scale = mapDisplayScale(ocadMapScale, zoom);
  if (scale == null || !Number.isFinite(scale)) return "—";
  const rounded = Math.max(1, Math.round(scale));
  return `1:${rounded.toLocaleString("sv-SE")}`;
}
