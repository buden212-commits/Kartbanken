#!/usr/bin/env tsx
/**
 * Control-circle and course-leg cutouts.
 * Run: npx tsx scripts/test-cutout-snap.mts
 */
import type { MapHitIndexEntry } from "../src/lib/ocad/map-hit-index";
import { snapCutoutAngleToNearbyFeature } from "../src/lib/ocad/map-hit-index";
import {
  angleFromCenter,
  hitTestCourseLeg,
  renderCircleWithCutoutsSvg,
} from "../src/lib/course/cutouts";
import { renderCourseOverlaySvg } from "../src/lib/course/geometry";
import { CourseObjectType, type EditorObject } from "../src/lib/course/types";
import { IDENTITY_SVG_TRANSFORM } from "../src/lib/ocad/svg-coords";
import { IOF_CONTROL_RADIUS } from "../src/lib/course/symbols";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed += 1;
  } else {
    failed += 1;
    console.error("FAIL:", message);
  }
}

function angularDiff(a: number, b: number): number {
  const twoPi = Math.PI * 2;
  const na = ((a % twoPi) + twoPi) % twoPi;
  const nb = ((b % twoPi) + twoPi) % twoPi;
  let diff = Math.abs(na - nb);
  if (diff > Math.PI) diff = twoPi - diff;
  return diff;
}

function feature(c: [number, number]): MapHitIndexEntry {
  return { c, b: [c[0] - 1, c[1] - 1, c[0] + 1, c[1] + 1], s: 101, t: "point" };
}

function editorPoint(
  clientId: string,
  symbolNr: number,
  sortOrder: number,
  coordinates: [number, number],
  extra?: Partial<Extract<EditorObject["geometry"], { type: "Point" }>>,
): EditorObject {
  return {
    clientId,
    id: clientId,
    symbolNr,
    objectType: CourseObjectType.POINT,
    geometry: { type: "Point", coordinates, ...extra },
    textContent: null,
    sortOrder,
  };
}

const center: [number, number] = [0, 0];
const radius = 100;
const eastClick: [number, number] = [radius, 0];
const clickAngle = angleFromCenter(center, eastClick);

const siteAtCenter = feature([2, 8]);
const pathOnEastRim = feature([radius + 10, 4]);
const boulderOnWestRim = feature([-radius, 0]);

const withoutNearby = snapCutoutAngleToNearbyFeature(
  [siteAtCenter],
  center,
  eastClick,
  radius,
  clickAngle,
);
assert(
  angularDiff(withoutNearby, clickAngle) < 0.01,
  "control-site feature at center does not steal the click angle",
);

const withPath = snapCutoutAngleToNearbyFeature(
  [siteAtCenter, pathOnEastRim],
  center,
  eastClick,
  radius,
  clickAngle,
);
assert(
  angularDiff(withPath, angleFromCenter(center, pathOnEastRim.c)) < 0.01,
  "snaps to map symbol near the click on the rim",
);

const opposite = snapCutoutAngleToNearbyFeature(
  [siteAtCenter, boulderOnWestRim],
  center,
  eastClick,
  radius,
  clickAngle,
);
assert(
  angularDiff(opposite, clickAngle) < 0.01,
  "does not snap to a symbol on the opposite side of the circle",
);

const start = editorPoint("s", 701, 0, [0, 0]);
const unused = editorPoint("unused", 703, 1, [0, 8000]);
const used = editorPoint("c31", 703, 2, [8000, 0]);
const finish = editorPoint("f", 706, 3, [8000, 8000]);
const courseObjects = [start, unused, used, finish];
const sequence = ["s", "c31", "f"];
const midLeg: [number, number] = [4000, 0];
const sequenceHit = hitTestCourseLeg(midLeg, courseObjects, 200, sequence);
assert(sequenceHit != null, "sequence hit finds the visible course leg");
assert(sequenceHit?.fromControl.clientId === "s", "visible leg starts at start");
assert(sequenceHit?.toControl.clientId === "c31", "visible leg ends at used control");

const sortHit = hitTestCourseLeg(midLeg, courseObjects, 200);
assert(
  sortHit == null || sortHit.toControl.clientId !== "c31",
  "sort-order hit does not follow the drawn sequence",
);

const cutoutSvg = renderCircleWithCutoutsSvg(
  [0, 0],
  IOF_CONTROL_RADIUS,
  [{ angleRad: 0 }],
  IDENTITY_SVG_TRANSFORM,
  "#FF00FF",
  35,
  1,
);
assert(cutoutSvg.includes("<path "), "cut-out circle is an SVG path for PDF");
assert(cutoutSvg.includes(" A "), "cut-out circle uses arc commands");
assert(!cutoutSvg.includes("<polyline"), "cut-out circle is not a polyline");

const overlay = renderCourseOverlaySvg(
  [
    editorPoint("s2", 701, 0, [0, 0]),
    editorPoint("c2", 703, 1, [4000, 0], {
      cutouts: [{ angleRad: Math.PI / 2 }],
      legGaps: [{ distance: 2000, length: 300 }],
    }),
    editorPoint("f2", 706, 2, [8000, 0]),
  ],
  IDENTITY_SVG_TRANSFORM,
  { sequence: ["s2", "c2", "f2"] },
);
assert(overlay.includes("<path "), "PDF overlay keeps control cutouts");
assert(overlay.includes("<line "), "PDF overlay draws course legs");
assert((overlay.match(/<line /g) ?? []).length >= 2, "gapped leg is split into segments");

if (failed > 0) {
  console.error(`${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`${passed} passed`);
