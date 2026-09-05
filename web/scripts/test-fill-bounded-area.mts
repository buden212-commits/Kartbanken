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
  // Must reach the real barrier (20/80), not stop a cell inside.
  assert.ok(Math.min(...xs) <= 20.75, `minX ${Math.min(...xs)} inset`);
  assert.ok(Math.max(...xs) >= 79.25, `maxX ${Math.max(...xs)} inset`);
  assert.ok(Math.min(...ys) <= 20.75, `minY ${Math.min(...ys)} inset`);
  assert.ok(Math.max(...ys) >= 79.25, `maxY ${Math.max(...ys)} inset`);
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
