/**
 * Kör: npx tsx scripts/test-ocad-object-create.mts
 * Verifierar TObject12-serialisering mot ocad2geojson-läsaren.
 */
import { createRequire } from "module";
import {
  defaultTObject12Template,
  TOBJECT12_HEADER_SIZE,
  writeTObject12,
  type OcadCoord,
} from "../src/lib/ocad/ocad-object-create";

const require = createRequire(import.meta.url);
const BufferReader = require("ocad2geojson/src/ocad-reader/buffer-reader") as new (
  buffer: Buffer,
) => { push: (offset: number) => void; pop: () => void; offset: number; buffer: Buffer };
const TObject12 = require("ocad2geojson/src/ocad-reader/tobject")[12] as new (
  reader: InstanceType<typeof BufferReader>,
  objIndex: { objType: number; _index: number },
) => { nItem: number; coordinates: Array<{ 0: number; 1: number; xFlags: number; yFlags: number }> };

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function readObject(coords: OcadCoord[]) {
  const bytes = writeTObject12(defaultTObject12Template(101, 2), coords);
  assert(bytes.length === TOBJECT12_HEADER_SIZE + coords.length * 8, "byte length mismatch");

  const reader = new BufferReader(bytes);
  const obj = new TObject12(reader, { objType: 2, _index: 0 }) as {
    nItem: number;
    otp: number;
    coordinates: Array<{ 0: number; 1: number; xFlags: number; yFlags: number }>;
  };
  assert(reader.offset === bytes.length, `reader consumed ${reader.offset}, expected ${bytes.length}`);
  assert(obj.nItem === coords.length, "nItem mismatch");
  assert(obj.otp === 2, "otp should be object type");
  for (let i = 0; i < coords.length; i++) {
    const expected = coords[i]!;
    const actual = obj.coordinates[i]!;
    assert(actual[0] === Math.round(expected.x), `x[${i}]`);
    assert(actual[1] === Math.round(expected.y), `y[${i}]`);
    assert(actual.xFlags === (expected.xFlags ?? 0), `xFlags[${i}]`);
    assert(actual.yFlags === (expected.yFlags ?? 0), `yFlags[${i}]`);
  }
}

const cases: OcadCoord[][] = [
  [{ x: 12345, y: 67890 }],
  [
    { x: 100, y: 200 },
    { x: 300, y: 400 },
  ],
  Array.from({ length: 9 }, (_, i) => ({ x: i * 100, y: i * 50, yFlags: i === 0 ? 0x01 : 0 })),
  [
    { x: 10, y: 20, yFlags: 0x01 },
    { x: 30, y: 20 },
    { x: 30, y: 40 },
    { x: 10, y: 40 },
    { x: 10, y: 20, yFlags: 0x01 },
  ],
];

for (const coords of cases) {
  readObject(coords);
}

console.log(`ocad-object-create tests passed (${cases.length} cases)`);
