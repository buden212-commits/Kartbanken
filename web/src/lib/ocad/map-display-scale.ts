/** Nominal on-screen map scale from OCAD file scale and viewport zoom (1 = hela kartan). */
export function mapDisplayScale(ocadMapScale: number, zoom: number): number | null {
  if (!(ocadMapScale > 0) || !(zoom > 0)) return null;
  return ocadMapScale / zoom;
}

export function formatMapDisplayScale(ocadMapScale: number, zoom: number): string {
  const scale = mapDisplayScale(ocadMapScale, zoom);
  if (scale == null || !Number.isFinite(scale)) return "—";
  const rounded = Math.max(1, Math.round(scale));
  return `1:${rounded.toLocaleString("sv-SE")}`;
}
