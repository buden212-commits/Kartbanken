/**
 * Unit tests for OCAD-style Bézier outgoing-handle → segment controls.
 *
 *   npx tsx scripts/test-bezier-draw-handles.mts
 */
import assert from "node:assert/strict";
import {
  controlsFromOutgoingHandles,
  mirrorThroughAnchor,
  sampleBezierPolyline,
} from "../src/lib/field-edit/geometry-tools.ts";

function almostEqual(a: [number, number], b: [number, number], eps = 1e-9) {
  assert.ok(Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps, `${a} != ${b}`);
}

{
  const tip: [number, number] = [10, 5];
  const anchor: [number, number] = [4, 5];
  almostEqual(mirrorThroughAnchor(tip, anchor), [-2, 5]);
}

{
  // Horizontal wave: anchors at (0,0), (10,5), (20,0) with rightward handles
  const anchors: [number, number][] = [
    [0, 0],
    [10, 5],
    [20, 0],
  ];
  const out: [number, number][] = [
    [3, 0], // outgoing from first → right
    [13, 5],
    [23, 0],
  ];
  const controls = controlsFromOutgoingHandles(anchors, out, false);
  assert.equal(controls.length, 2);
  almostEqual(controls[0]!.p1, [3, 0]);
  almostEqual(controls[0]!.p2, [7, 5]); // mirror of (13,5) through (10,5)
  almostEqual(controls[1]!.p1, [13, 5]);
  almostEqual(controls[1]!.p2, [17, 0]);

  const sampled = sampleBezierPolyline(anchors, controls, false, 8);
  assert.ok(sampled.length >= 8);
  // Midpoint of first segment should bend toward +Y (above the chord)
  const mid = sampled[Math.floor(sampled.length / 4)]!;
  assert.ok(mid[1] > 0, `expected upward bend, got ${mid}`);
}

{
  // Closed triangle with equal handles
  const anchors: [number, number][] = [
    [0, 0],
    [10, 0],
    [5, 8],
  ];
  const out: [number, number][] = [
    [2, 0],
    [10, 2],
    [3, 8],
  ];
  const controls = controlsFromOutgoingHandles(anchors, out, true);
  assert.equal(controls.length, 3);
}

{
  assert.deepEqual(controlsFromOutgoingHandles([[0, 0]], [[1, 1]], false), []);
  assert.deepEqual(
    controlsFromOutgoingHandles(
      [
        [0, 0],
        [1, 1],
      ],
      [[0, 0]],
      false,
    ),
    [],
  );
}

console.log("test-bezier-draw-handles: OK");
