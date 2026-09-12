import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { readOcad } = require("ocad2geojson") as {
  readOcad: (
    input: Buffer,
    options?: { quietWarnings?: boolean },
  ) => Promise<{
    getCrs: () => { scale?: number } | null;
  }>;
};

const DEFAULT_MAP_SCALE = 15000;

export async function readMapScaleFromBuffer(buffer: Buffer): Promise<number> {
  const ocadFile = await readOcad(buffer, { quietWarnings: true });
  const scale = ocadFile.getCrs()?.scale;
  return typeof scale === "number" && Number.isFinite(scale) && scale > 0
    ? scale
    : DEFAULT_MAP_SCALE;
}
