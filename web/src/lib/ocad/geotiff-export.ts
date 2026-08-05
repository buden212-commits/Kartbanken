import { writeArrayBuffer } from "geotiff";
import type { OcadCrsInfo } from "./crs";
import { exportFrameProjectedExtent } from "./crs";
import type { ExportFrame } from "./map-export";

export type GeoTiffExportInput = {
  rgba: Uint8Array;
  width: number;
  height: number;
  frame: ExportFrame;
  crs: OcadCrsInfo;
};

/** Build a georeferenced RGB GeoTIFF from a rasterized map export. */
export function buildGeoreferencedGeoTiff(input: GeoTiffExportInput): Buffer {
  const { rgba, width, height, frame, crs } = input;
  const extent = exportFrameProjectedExtent(frame, crs);

  const pixelScaleX = (extent.maxE - extent.minE) / width;
  const pixelScaleY = (extent.maxN - extent.minN) / height;

  const interleaved = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    const src = i * 4;
    const dst = i * 3;
    interleaved[dst] = rgba[src] ?? 255;
    interleaved[dst + 1] = rgba[src + 1] ?? 255;
    interleaved[dst + 2] = rgba[src + 2] ?? 255;
  }

  const values = Object.assign(interleaved, { width, height });

  const arrayBuffer = writeArrayBuffer(values, {
    width,
    height,
    BitsPerSample: [8, 8, 8],
    SampleFormat: [1, 1, 1],
    PhotometricInterpretation: 2,
    SamplesPerPixel: 3,
    PlanarConfiguration: 1,
    ModelPixelScale: [pixelScaleX, pixelScaleY, 0],
    ModelTiepoint: [0, 0, 0, extent.minE, extent.maxN, 0],
    GTModelTypeGeoKey: 1,
    GTRasterTypeGeoKey: 1,
    ProjectedCSTypeGeoKey: crs.epsg,
  });

  return Buffer.from(arrayBuffer);
}
