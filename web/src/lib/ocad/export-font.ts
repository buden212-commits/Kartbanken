import { join } from "node:path";

/** Bundled face so PDF text renders on Vercel, which has no system fonts. Apache-2.0. */
export const EXPORT_FONT_FAMILY = "Roboto";

const FONT_DIR = join(process.cwd(), "src/lib/ocad/fonts");

export const EXPORT_FONT_FILES = [
  join(FONT_DIR, "Roboto-Regular.ttf"),
  join(FONT_DIR, "Roboto-Bold.ttf"),
  join(FONT_DIR, "Roboto-Italic.ttf"),
  join(FONT_DIR, "Roboto-BoldItalic.ttf"),
];

/** Point every text run at the bundled family. OCAD and course labels ask for Arial. */
export function svgWithExportFont(svg: string): string {
  return svg
    .replace(/font-family="[^"]*"/gi, `font-family="${EXPORT_FONT_FAMILY}"`)
    .replace(/font-family:\s*[^;"']+/gi, `font-family: ${EXPORT_FONT_FAMILY}`);
}
