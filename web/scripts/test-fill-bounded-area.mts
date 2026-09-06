/**
 * Quick unit checks for fillBoundedArea.
 * Run: npx tsx scripts/test-fill-bounded-area.mts
 */
import assert from "node:assert/strict";
import {
  fillBoundedArea,
  isFillBoundedIgnoredSymbol,
} from "../src/lib/field-edit/fill-bounded-area.ts";

assert.equal(isFillBoundedIgnoredSymbol(101000), true);
assert.equal(isFillBoundedIgnoredSymbol(102000), true);
assert.equal(isFillBoundedIgnoredSymbol(103000), true);
assert.equal(isFillBoundedIgnoredSymbol(601000), true);
assert.equal(isFillBoundedIgnoredSymbol(701000), true);
assert.equal(isFillBoundedIgnoredSymbol(401000), false);
assert.equal(isFillBoundedIgnoredSymbol(301000), false);

const viewport = { minX: 0, minY: 0, maxX: 100, maxY: 100 };

// Closed square from four line segments
const square: [number, number][] = [
  [20, 20],
  [80, 20],
  [80, 80],
  [20, 80],
  [20, 20],
];

const enclosed = fillBoundedArea({
  click: [50, 50],
  viewport,
  barriers: [{ symbolNumber: 401000, type: "line", coordinates: square }],
  maxGridSize: 128,
});
assert.equal(enclosed.ok, true, enclosed.ok ? "" : enclosed.message);
if (enclosed.ok) {
  assert.ok(enclosed.ring.length >= 4);
  assert.equal(enclosed.holes.length, 0);
  const xs = enclosed.ring.map((p) => p[0]);
  const ys = enclosed.ring.map((p) => p[1]);
  // Exact barrier vertices — not a raster inset.
  assert.ok(Math.min(...xs) === 20, `minX ${Math.min(...xs)}`);
  assert.ok(Math.max(...xs) === 80, `maxX ${Math.max(...xs)}`);
  assert.ok(Math.min(...ys) === 20, `minY ${Math.min(...ys)}`);
  assert.ok(Math.max(...ys) === 80, `maxY ${Math.max(...ys)}`);
  for (const corner of [
    [20, 20],
    [80, 20],
    [80, 80],
    [20, 80],
  ] as [number, number][]) {
    assert.ok(
      enclosed.ring.some((p) => p[0] === corner[0] && p[1] === corner[1]),
      `missing corner ${corner}`,
    );
  }
}

// Intermediate vertices on the bounding polyline must be kept.
const withBreaks: [number, number][] = [
  [20, 20],
  [50, 20],
  [80, 20],
  [80, 80],
  [20, 80],
  [20, 20],
];
const breaks = fillBoundedArea({
  click: [50, 50],
  viewport,
  barriers: [{ symbolNumber: 401000, type: "line", coordinates: withBreaks }],
  maxGridSize: 128,
});
assert.equal(breaks.ok, true, breaks.ok ? "" : breaks.message);
if (breaks.ok) {
  assert.ok(
    breaks.ring.some((p) => p[0] === 50 && p[1] === 20),
    "missing intermediate vertex (50,20)",
  );
}

// Open U-shape — not enclosed
const openU: [number, number][] = [
  [20, 20],
  [20, 80],
  [80, 80],
  [80, 20],
];
const open = fillBoundedArea({
  click: [50, 50],
  viewport,
  barriers: [{ symbolNumber: 401000, type: "line", coordinates: openU }],
  maxGridSize: 128,
});
assert.equal(open.ok, false);
if (!open.ok) assert.equal(open.reason, "not_enclosed");

// Square with inner building area → hole
const outer: [number, number][] = [
  [10, 10],
  [90, 10],
  [90, 90],
  [10, 90],
  [10, 10],
];
const building: [number, number][] = [
  [40, 40],
  [60, 40],
  [60, 60],
  [40, 60],
  [40, 40],
];
const withHole = fillBoundedArea({
  click: [20, 20],
  viewport,
  barriers: [
    { symbolNumber: 401000, type: "line", coordinates: outer },
    { symbolNumber: 526000, type: "area", coordinates: building },
  ],
  maxGridSize: 160,
});
assert.equal(withHole.ok, true, withHole.ok ? "" : withHole.message);
if (withHole.ok) {
  assert.ok(withHole.holes.length >= 1, "expected at least one hole");
  assert.ok(Math.min(...withHole.ring.map((p) => p[0])) === 10);
  assert.ok(Math.max(...withHole.ring.map((p) => p[0])) === 90);
}

// Contours ignored — square made of contour symbol should not enclose
const contourOnly = fillBoundedArea({
  click: [50, 50],
  viewport,
  barriers: [{ symbolNumber: 101000, type: "line", coordinates: square }],
  maxGridSize: 128,
});
assert.equal(contourOnly.ok, false);
if (!contourOnly.ok) assert.equal(contourOnly.reason, "no_barriers");

console.log("fill-bounded-area tests OK");
