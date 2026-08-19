/** View transform helpers for panned/zoomed/rotated SVG map content. */

export type MapViewTransform = {
  pan: { x: number; y: number };
  zoom: number;
  bearing: number;
};

export function hasMapRotation(bearing: number): boolean {
  return Math.abs(bearing) > 0.01;
}

/** Screen position for a map content point (mapPointToScreen output) at given view. */
export function mapContentToScreen(
  baseX: number,
  baseY: number,
  viewportWidth: number,
  viewportHeight: number,
  view: MapViewTransform,
): [number, number] {
  if (!hasMapRotation(view.bearing)) {
    return [view.pan.x + baseX * view.zoom, view.pan.y + baseY * view.zoom];
  }

  const cx = viewportWidth / 2;
  const cy = viewportHeight / 2;
  const mx = baseX - cx;
  const my = baseY - cy;
  const rad = (view.bearing * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const zx = mx * view.zoom;
  const zy = my * view.zoom;
  const rx = zx * cos - zy * sin;
  const ry = zx * sin + zy * cos;
  return [cx + view.pan.x + rx, cy + view.pan.y + ry];
}

/** Pan values that place `baseX/baseY` at the viewport center. */
export function panForCenteredMapPoint(
  baseX: number,
  baseY: number,
  viewportWidth: number,
  viewportHeight: number,
  zoom: number,
  bearing: number,
): { x: number; y: number } {
  if (!hasMapRotation(bearing)) {
    return {
      x: viewportWidth / 2 - baseX * zoom,
      y: viewportHeight / 2 - baseY * zoom,
    };
  }

  const cx = viewportWidth / 2;
  const cy = viewportHeight / 2;
  const mx = baseX - cx;
  const my = baseY - cy;
  const rad = (bearing * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const zx = mx * zoom;
  const zy = my * zoom;
  const rx = zx * cos - zy * sin;
  const ry = zx * sin + zy * cos;
  return {
    x: -rx,
    y: -ry,
  };
}

export function buildMapLayerTransform(view: MapViewTransform): string {
  if (!hasMapRotation(view.bearing)) {
    return `translate(${view.pan.x}px, ${view.pan.y}px) scale(${view.zoom})`;
  }

  return [
    `translate(calc(50% + ${view.pan.x}px), calc(50% + ${view.pan.y}px))`,
    `rotate(${view.bearing}deg)`,
    `scale(${view.zoom})`,
    `translate(-50%, -50%)`,
  ].join(" ");
}
