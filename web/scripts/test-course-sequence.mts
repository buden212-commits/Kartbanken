#!/usr/bin/env tsx
/**
 * Tests for course sequence: codes 31+, visit order, reuse labels.
 * Run: npx tsx scripts/test-course-sequence.mts
 */
import { CourseObjectType, type EditorObject } from "../src/lib/course/types";
import {
  appendVisit,
  assignMissingControlCodes,
  buildMapLabelMap,
  canAppendVisit,
  courseHint,
  nextControlCode,
  parseControlCode,
  removeVisitAt,
  resolveSequence,
  unusedControls,
} from "../src/lib/course/sequence";
import { computeCourseLengthMeters } from "../src/lib/course/geometry";
import {
  keepControlLayer,
  mergeLayerAndCourseObjects,
} from "../src/lib/course/control-layer";
import {
  claimControlNumberAndPrune,
  ensureControlNumbers,
} from "../src/lib/course/control-numbers";

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

function point(
  clientId: string,
  symbolNr: number,
  sortOrder: number,
  textContent: string | null = null,
): EditorObject {
  return {
    clientId,
    id: clientId,
    symbolNr,
    objectType: CourseObjectType.POINT,
    geometry: { type: "Point", coordinates: [sortOrder * 100, 0] },
    textContent,
    sortOrder,
  };
}

const start = point("s", 701, 0);
const c31 = point("c31", 703, 1, "31");
const c32 = point("c32", 703, 2, "32");
const finish = point("f", 706, 3);
const objects = [start, c31, c32, finish];

assert(nextControlCode(objects) === 33, "next code after 31 and 32 is 33");
assert(nextControlCode([]) === 31, "first code is 31");
assert(parseControlCode(c31) === 31, "parse code 31");

const assigned = assignMissingControlCodes([point("a", 703, 0), point("b", 703, 1)]);
assert(assigned[0]?.textContent === "31", "assign first missing code 31");
assert(assigned[1]?.textContent === "32", "assign second missing code 32");

assert(
  resolveSequence(objects, null).join(",") === "s,c31,c32,f",
  "legacy sequence is all network points",
);
assert(resolveSequence(objects, []).length === 0, "explicit empty sequence stays empty");

let sequence: string[] = [];
assert(canAppendVisit(objects, sequence, c31).ok === false, "cannot start with control");
assert(canAppendVisit(objects, sequence, start).ok === true, "can start with start");
sequence = appendVisit(sequence, "s");
assert(canAppendVisit(objects, sequence, start).ok === false, "cannot append start again");
sequence = appendVisit(sequence, "c31");
sequence = appendVisit(sequence, "c32");
sequence = appendVisit(sequence, "c31");
assert(canAppendVisit(objects, sequence, finish).ok === true, "can append finish");
sequence = appendVisit(sequence, "f");
assert(canAppendVisit(objects, sequence, c32).ok === false, "cannot append after finish");

const labels = buildMapLabelMap(objects, ["s", "c31", "c32", "c31", "f"]);
assert(labels.get("c31") === "1/3", "reused control shows 1/3");
assert(labels.get("c32") === "2", "single visit shows 2");

const extra = point("c33", 703, 4, "33");
const withUnused = [...objects, extra];
assert(unusedControls(withUnused, ["s", "c31", "f"]).map((o) => o.clientId).join(",") === "c32,c33", "unused controls");

const afterRemoveStart = removeVisitAt(["s", "c31", "f"], 0);
assert(afterRemoveStart.length === 0, "removing start clears sequence");

const lengthShort = computeCourseLengthMeters(objects, 15000, ["s", "c31", "f"]);
const far = point("far", 703, 50, "99");
const withFar = [...objects, far];
assert(lengthShort > 0, "short course has length");
assert(
  computeCourseLengthMeters(withFar, 15000, ["s", "c31", "f"]) === lengthShort,
  "unused far control does not add to sequence length",
);
assert(
  computeCourseLengthMeters(withFar, 15000, null) > lengthShort,
  "legacy length includes unused far control",
);

const kept = keepControlLayer([start, c31, c32, finish, extra]);
assert(
  kept.every((o) => o.symbolNr === 701 || o.symbolNr === 703 || o.symbolNr === 704 || o.symbolNr === 706),
  "new course keeps control layer including start and finish",
);
assert(kept.some((o) => o.clientId === "c31"), "kept control 31");
assert(kept.some((o) => o.clientId === "s"), "kept start on control layer");
assert(kept.some((o) => o.clientId === "f"), "kept finish on control layer");

const merged = mergeLayerAndCourseObjects(
  [
    { id: "s", symbolNr: 701, objectType: CourseObjectType.POINT, geometry: { type: "Point", coordinates: [1, 0] }, textContent: null, sortOrder: 0 },
    { id: "c31", symbolNr: 703, objectType: CourseObjectType.POINT, geometry: { type: "Point", coordinates: [0, 0] }, textContent: "31", sortOrder: 1 },
    { id: "f", symbolNr: 706, objectType: CourseObjectType.POINT, geometry: { type: "Point", coordinates: [2, 0] }, textContent: null, sortOrder: 2 },
  ],
  [
    { id: "c31", symbolNr: 703, objectType: CourseObjectType.POINT, geometry: { type: "Point", coordinates: [0, 0] }, textContent: "31", sortOrder: 1 },
  ],
);
assert(merged.filter((o) => o.id === "c31").length === 1, "merge does not duplicate layer ids");
assert(merged.some((o) => o.id === "s"), "merge keeps layer start");
assert(merged.some((o) => o.id === "f"), "merge keeps layer finish");

assert(
  courseHint([], [c31, c32]).includes("ligger kvar"),
  "hint mentions leftover controls when start is missing",
);

function textNumber(
  clientId: string,
  controlId: string | undefined,
  index: number,
  label: string,
  sortOrder: number,
  coords: [number, number] = [380, 0],
): EditorObject {
  return {
    clientId,
    id: clientId,
    symbolNr: 704,
    objectType: CourseObjectType.TEXT,
    geometry: {
      type: "Point",
      coordinates: coords,
      linkedControlIndex: index,
      ...(controlId ? { linkedControlId: controlId } : {}),
    },
    textContent: label,
    sortOrder,
  };
}

const c33 = point("c33id", 703, 0, "33");
const numLinked = textNumber("n-good", "c33id", 1, "2", 1);
const numOrphan = textNumber("n-stale", "tmp_old", 1, "33", 2);
const afterEmpty = ensureControlNumbers([c33, numLinked, numOrphan], []);
const afterEmpty704 = afterEmpty.filter((o) => o.symbolNr === 704);
assert(afterEmpty704.length === 1, "empty sequence prunes duplicate 704");
assert(afterEmpty704[0]?.textContent === "33", "empty sequence shows control code, not visit number");

const afterStale = ensureControlNumbers(
  [c33, textNumber("n-stale-only", "tmp_old", 1, "33", 1)],
  [],
);
assert(afterStale.filter((o) => o.symbolNr === 704).length === 1, "stale tmp_ id still matches by index");
assert(
  afterStale.find((o) => o.symbolNr === 704)?.geometry.type === "Point" &&
    (afterStale.find((o) => o.symbolNr === 704)?.geometry as { linkedControlId?: string })
      .linkedControlId === "c33id",
  "stale 704 is relinked to persisted control id",
);

const claimed = claimControlNumberAndPrune(
  [c33, numLinked, numOrphan],
  "n-stale",
  [],
);
const claimed704 = claimed.filter((o) => o.symbolNr === 704);
assert(claimed704.length === 1, "claiming a number drops the copy underneath");
assert(claimed704[0]?.clientId === "n-stale", "the number you grabbed is the one that remains");

if (failed > 0) {
  console.error(`${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`${passed} passed`);
