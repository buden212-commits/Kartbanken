#!/usr/bin/env tsx
/**
 * Unit tests for course PDF scale math (T10.18).
 * Run: npm run test:course-pdf-scale
 */
import {
  clampCourseScale,
  computeExportAreaUnits,
  exportFrameBbox,
  exportFrameFromCenter,
  exportFrameFromExtent,
  paperSizeMm,
  parseCourseScale,
} from "../src/lib/course/pdf-scale";
import { courseObjectsBbox } from "../src/lib/course/geometry";
import type { CourseGeometry } from "../src/lib/course/types";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error("FAIL:", message);
  }
}

// A4 portrait at 1:10000 with file scale 15000
const a4Portrait = computeExportAreaUnits(10000, 15000, "A4", "portrait");
assert(a4Portrait.widthMm === 210, "A4 portrait width 210mm");
assert(a4Portrait.heightMm === 297, "A4 portrait height 297mm");
assert(
  Math.abs(a4Portrait.widthUnits - 210 * 100 * (10000 / 15000)) < 0.01,
  "width units scale ratio",
);

// A3 landscape
const a3Landscape = paperSizeMm("A3", "landscape");
assert(a3Landscape.widthMm === 420, "A3 landscape width");
assert(a3Landscape.heightMm === 297, "A3 landscape height");

// Scale clamping
assert(clampCourseScale(1000) === 4000, "clamp min 4000");
assert(clampCourseScale(50000) === 20000, "clamp max 20000");
assert(parseCourseScale("7500") === 7500, "parse scale");

// Export frame bbox centered at origin
const frame = exportFrameFromCenter(0, 0, 10000, 15000, "A4", "portrait");
const bbox = exportFrameBbox(frame);
assert(Math.abs(bbox.x + bbox.width / 2) < 0.01, "frame centered x");
assert(Math.abs(bbox.y + bbox.height / 2) < 0.01, "frame centered y");

const extentFrame = exportFrameFromExtent(
  { minX: 100, minY: 200, maxX: 300, maxY: 400 },
  10000,
  15000,
  "A4",
  "portrait",
);
assert(extentFrame.centerX === 200, "extent frame center x");
assert(extentFrame.centerY === 300, "extent frame center y");

const geoBbox = courseObjectsBbox([
  { geometry: { type: "Point", coordinates: [10, 20] } satisfies CourseGeometry },
  { geometry: { type: "Point", coordinates: [40, 50] } satisfies CourseGeometry },
  {
    geometry: {
      type: "LineString",
      coordinates: [
        [0, 0],
        [100, 5],
      ],
    } satisfies CourseGeometry,
  },
]);
assert(geoBbox != null, "course bbox exists");
assert(geoBbox!.minX === 0 && geoBbox!.maxX === 100, "course bbox x");
assert(geoBbox!.minY === 0 && geoBbox!.maxY === 50, "course bbox y");

console.log(`\nCourse PDF scale tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
