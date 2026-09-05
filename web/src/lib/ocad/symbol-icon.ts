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
