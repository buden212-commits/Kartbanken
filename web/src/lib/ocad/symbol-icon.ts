import sharp from "sharp";

/** OCAD 9+ symbol tree icon size (IconBits is 22×22). */
export const OCAD_SYMBOL_ICON_SIZE = 22;

/**
 * OCAD IconV9 palette: 5³ = 125 colours with channels in {0,64,128,192,255}.
 * Index = rIdx*25 + gIdx*5 + bIdx (same as OpenOrienteering Mapper).
 */
const ICON_V9_PALETTE: ReadonlyArray<readonly [number, number, number]> = (() => {
  const steps = [0, 64, 128, 192, 255] as const;
  const out: Array<[number, number, number]> = [];
  for (const r of steps) {
    for (const g of steps) {
      for (const b of steps) {
        out.push([r, g, b]);
      }
    }
  }
  return out;
})();

function paletteColor(index: number): readonly [number, number, number] {
  const clamped = Number.isFinite(index) ? Math.min(Math.max(index | 0, 0), 124) : 124;
  return ICON_V9_PALETTE[clamped] ?? [255, 255, 255];
}

function isNearBlack(r: number, g: number, b: number): boolean {
  return r < 40 && g < 40 && b < 40;
}

type RowInk = { black: number; opaque: number };

function rowInk(rgba: Buffer, size: number, y: number): RowInk {
  let black = 0;
  let opaque = 0;
  for (let x = 0; x < size; x++) {
    const offset = (y * size + x) * 4;
    if (rgba[offset + 3]! < 30) continue;
    opaque++;
    if (isNearBlack(rgba[offset]!, rgba[offset + 1]!, rgba[offset + 2]!)) black++;
  }
  return { black, opaque };
}

/**
 * OCAD icon bitmaps often pad the top/bottom with black rows (sometimes with
 * junk palette bytes on the outermost rows). Fine on OCAD's dark tree, but
 * shows as a black bar on a white UI. Clear those edge pads only — keep real
 * black symbol ink (dots, vertical lines, outlines in the content area).
 */
function clearBlackPaddingRows(rgba: Buffer, size: number): void {
  const isEmpty = (ink: RowInk) => ink.opaque === 0;
  /** Wide black bar — padding, not a 1–2 px symbol stroke. */
  const isBlackPad = (ink: RowInk) =>
    ink.black >= Math.ceil(size * 0.4) && ink.black >= Math.max(1, ink.opaque - 3);

  const uniqueOpaqueColors = (y: number): number => {
    const colors = new Set<string>();
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 4;
      if (rgba[offset + 3]! < 30) continue;
      colors.add(`${rgba[offset]},${rgba[offset + 1]},${rgba[offset + 2]}`);
    }
    return colors.size;
  };

  /**
   * Outermost rows sometimes contain high-entropy junk bytes (not real icon art).
   * Real strokes use few colours; garbage mixes many palette indices.
   */
  const isJunkRow = (ink: RowInk, y: number): boolean =>
    ink.opaque >= 8 && uniqueOpaqueColors(y) >= 4 && ink.black < ink.opaque * 0.85;

  /** Outermost row with leftover non-black bytes sitting on a black pad. */
  const isJunkEdgeOverPad = (ink: RowInk, inward: RowInk) =>
    ink.black >= Math.ceil(size * 0.35) && isBlackPad(inward);

  /** True when further inward there is a fully empty gap, then real content. */
  const hasEmptyGapBeforeContent = (fromY: number, step: number): boolean => {
    let seenEmpty = false;
    for (let y = fromY + step; y >= 0 && y < size; y += step) {
      const ink = rowInk(rgba, size, y);
      if (isEmpty(ink)) {
        seenEmpty = true;
        continue;
      }
      if (isBlackPad(ink) || isJunkRow(ink, y)) continue;
      return seenEmpty;
    }
    return false;
  };

  const clearRow = (y: number) => {
    for (let x = 0; x < size; x++) {
      rgba[(y * size + x) * 4 + 3] = 0;
    }
  };

  const clearFromEdge = (start: number, step: number) => {
    for (let y = start; y >= 0 && y < size; y += step) {
      const ink = rowInk(rgba, size, y);
      if (isEmpty(ink) || isBlackPad(ink) || isJunkRow(ink, y)) {
        clearRow(y);
        continue;
      }
      const inwardY = y + step;
      if (inwardY >= 0 && inwardY < size) {
        const inward = rowInk(rgba, size, inwardY);
        if (isJunkEdgeOverPad(ink, inward)) {
          clearRow(y);
          continue;
        }
      }
      // Detached strip below/above a transparent gap (common OCAD icon footer junk).
      if (hasEmptyGapBeforeContent(y, step)) {
        clearRow(y);
        continue;
      }
      break;
    }
  };

  clearFromEdge(0, 1);
  clearFromEdge(size - 1, -1);
}

/** Decode OCAD IconBits (484 bytes, bottom→top) to RGBA top→bottom. */
export function ocadIconBitsToRgba(iconBits: ArrayLike<number>): Buffer {
  const size = OCAD_SYMBOL_ICON_SIZE;
  const rgba = Buffer.alloc(size * size * 4);
  let i = 0;
  for (let y = size - 1; y >= 0; y--) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = paletteColor(iconBits[i++] ?? 124);
      const offset = (y * size + x) * 4;
      const transparent = r === 255 && g === 255 && b === 255;
      rgba[offset] = r;
      rgba[offset + 1] = g;
      rgba[offset + 2] = b;
      rgba[offset + 3] = transparent ? 0 : 255;
    }
  }
  clearBlackPaddingRows(rgba, size);
  return rgba;
}

/** PNG data URL for an OCAD symbol tree icon, or null if bits are missing/empty. */
export async function ocadIconBitsToPngDataUrl(
  iconBits: ArrayLike<number> | null | undefined,
): Promise<string | null> {
  if (!iconBits || iconBits.length < OCAD_SYMBOL_ICON_SIZE * OCAD_SYMBOL_ICON_SIZE) {
    return null;
  }
  let hasInk = false;
  for (let i = 0; i < iconBits.length; i++) {
    const idx = iconBits[i] ?? 124;
    if (idx !== 124 && idx !== 15) {
      // 15 is white in V8; 124 is white in V9. Either means empty pixel.
      const [r, g, b] = paletteColor(idx);
      if (!(r === 255 && g === 255 && b === 255)) {
        hasInk = true;
        break;
      }
    }
  }
  if (!hasInk) return null;

  const rgba = ocadIconBitsToRgba(iconBits);
  const png = await sharp(rgba, {
    raw: { width: OCAD_SYMBOL_ICON_SIZE, height: OCAD_SYMBOL_ICON_SIZE, channels: 4 },
  })
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}
