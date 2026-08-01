export type SvgRootTransform = {
  tx: number;
  ty: number;
  flipY: boolean;
};

export const IDENTITY_SVG_TRANSFORM: SvgRootTransform = { tx: 0, ty: 0, flipY: false };

/** Parse ocad2svg root group transform from rendered SVG inner markup. */
export function parseSvgRootTransform(svgInner: string): SvgRootTransform {
  const match = svgInner.match(/<g[^>]*transform="translate\(([^,]+),\s*([^)]+)\)"/i);
  if (!match) return IDENTITY_SVG_TRANSFORM;

  const tx = Number(match[1]);
  const ty = Number(match[2]);
  if (!Number.isFinite(tx) || !Number.isFinite(ty)) return IDENTITY_SVG_TRANSFORM;

  // ocad2geojson uses OCAD math coords; ocad2svg draws with flipped Y inside a translate group.
  return { tx, ty, flipY: true };
}

/** Convert geojson/OCAD diff coordinates to SVG viewBox user space. */
export function geoToSvgUserPoint(
  geo: [number, number],
  transform: SvgRootTransform,
): [number, number] {
  const [gx, gy] = geo;
  if (transform.flipY) {
    return [gx + transform.tx, transform.ty - gy];
  }
  return [gx + transform.tx, gy + transform.ty];
}

/** Convert SVG viewBox user space back to geojson/OCAD diff coordinates. */
export function svgUserToGeoPoint(
  svg: [number, number],
  transform: SvgRootTransform,
): [number, number] {
  const [sx, sy] = svg;
  if (transform.flipY) {
    return [sx - transform.tx, transform.ty - sy];
  }
  return [sx - transform.tx, sy - transform.ty];
}

export function geoBboxToSvgUser(
  bbox: [number, number, number, number],
  transform: SvgRootTransform,
): [number, number, number, number] {
  const [minX, minY, maxX, maxY] = bbox;
  if (transform.flipY) {
    return [
      minX + transform.tx,
      transform.ty - maxY,
      maxX + transform.tx,
      transform.ty - minY,
    ];
  }
  return [
    minX + transform.tx,
    minY + transform.ty,
    maxX + transform.tx,
    maxY + transform.ty,
  ];
}

/** Convert an export frame from SVG viewBox space to OCAD native coordinates. */
export function exportFrameBboxToGeo(
  frame: {
    centerX: number;
    centerY: number;
    widthUnits: number;
    heightUnits: number;
  },
  transform: SvgRootTransform,
): { x: number; y: number; width: number; height: number } {
  const svgX = frame.centerX - frame.widthUnits / 2;
  const svgY = frame.centerY - frame.heightUnits / 2;

  if (transform.flipY) {
    return {
      x: svgX - transform.tx,
      y: transform.ty - (svgY + frame.heightUnits),
      width: frame.widthUnits,
      height: frame.heightUnits,
    };
  }

  return {
    x: svgX - transform.tx,
    y: svgY - transform.ty,
    width: frame.widthUnits,
    height: frame.heightUnits,
  };
}

export function mapPointToScreen(
  svgX: number,
  svgY: number,
  viewBox: string,
  containerWidth: number,
  containerHeight: number,
): [number, number] {
  const parts = viewBox.trim().split(/\s+/).map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) {
    return [containerWidth / 2, containerHeight / 2];
  }

  const [vbX, vbY, vbW, vbH] = parts;
  const scale = Math.min(containerWidth / vbW!, containerHeight / vbH!);
  const offsetX = (containerWidth - vbW! * scale) / 2;
  const offsetY = (containerHeight - vbH! * scale) / 2;
  return [offsetX + (svgX - vbX!) * scale, offsetY + (svgY - vbY!) * scale];
}
