/**
 * Unit checks for OpenOrienteering Mapper .omap export.
 * Run: npx tsx scripts/test-omap-export.mts
 */
import assert from "node:assert/strict";
import { buildOmapXml, type OmapExportOcadFile } from "../src/lib/ocad/omap-export.ts";

function poly(x: number, y: number, xFlags = 0, yFlags = 0) {
  const p = [x, y] as [number, number] & {
    xFlags: number;
    yFlags: number;
    isFirstBezier: () => boolean;
    isSecondBezier: () => boolean;
    isCornerPoint: () => boolean;
    isFirstHolePoint: () => boolean;
    isDashPoint: () => boolean;
  };
  p.xFlags = xFlags;
  p.yFlags = yFlags;
  p.isFirstBezier = () => !!(xFlags & 0x01);
  p.isSecondBezier = () => !!(xFlags & 0x02);
  p.isCornerPoint = () => !!(yFlags & 0x01);
  p.isFirstHolePoint = () => !!(yFlags & 0x02);
  p.isDashPoint = () => !!(yFlags & 0x08);
  return p;
}

const ocadFile: OmapExportOcadFile = {
  header: { version: 12 },
  colors: [
    undefined,
    {
      number: 1,
      name: "Black",
      cmyk: [0, 0, 0, 1],
      rgbArray: [0, 0, 0],
    },
    {
      number: 2,
      name: "Yellow",
      cmyk: [0, 0, 1, 0],
      rgbArray: [255, 255, 0],
    },
  ],
  symbols: [
    {
      symNum: 101000,
      type: 2,
      description: "Contour",
      lineColor: 1,
      lineWidth: 14,
      colors: [1],
    },
    {
      symNum: 401000,
      type: 3,
      description: "Open land",
      fillColor: 2,
      fillOn: true,
      colors: [2],
    },
    {
      symNum: 526000,
      type: 1,
      description: "Building",
      colors: [1],
      elements: [{ type: 4, color: 1, diameter: 60 }],
    },
  ],
  objects: [
    {
      sym: 101000,
      otp: 2,
      coordinates: [poly(0, 0), poly(1000, 0), poly(1000, 500)],
      objIndex: { status: 1, _index: 0 },
    },
    {
      sym: 401000,
      otp: 3,
      coordinates: [
        poly(0, 0),
        poly(2000, 0),
        poly(2000, 2000),
        poly(0, 2000),
        poly(0, 0),
      ],
      objIndex: { status: 1, _index: 1 },
    },
    {
      sym: 526000,
      otp: 1,
      ang: 900,
      coordinates: [poly(500, 500)],
      objIndex: { status: 1, _index: 2 },
    },
    {
      sym: 101000,
      otp: 2,
      coordinates: [poly(9000, 9000), poly(9100, 9100)],
      objIndex: { status: 1, _index: 3 },
    },
  ],
  getCrs: () => ({
    easting: 500000,
    northing: 6700000,
    scale: 10000,
    grivation: 0,
    code: 3006,
    name: "SWEREF99 TM",
  }),
};

const full = buildOmapXml(ocadFile);
assert.ok(full.xml.includes('xmlns="http://openorienteering.org/apps/mapper/xml/v2"'));
assert.ok(full.xml.includes("<map "));
assert.ok(full.xml.includes('version="9"'));
assert.ok(full.xml.includes("EPSG:3006"));
assert.ok(full.xml.includes("Contour"));
assert.ok(full.xml.includes("Open land"));
assert.ok(full.xml.includes("Building"));
assert.equal(full.objectCount, 4);
assert.equal(full.symbolCount, 3);
assert.equal(full.colorCount, 2);

// Y flip + *10: OCAD (1000, 500) → Mapper (10000, -5000)
assert.ok(full.xml.includes("10000 -5000"), "expected Y-flipped mapper coords");

const cropped = buildOmapXml(ocadFile, {
  keptObjectIndices: [0, 2],
});
assert.equal(cropped.objectCount, 2);
assert.ok(cropped.xml.includes("Contour"));
assert.ok(cropped.xml.includes("Building"));
assert.ok(!cropped.xml.includes("Open land") || cropped.symbolCount <= 2);

const empty = buildOmapXml(ocadFile, { keptObjectIndices: [] });
assert.equal(empty.objectCount, 0);

console.log("omap-export tests OK");
