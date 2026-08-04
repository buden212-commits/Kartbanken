/**
 * Verifierar checkout overlap-logik utan databas.
 * Kör: npm run test:checkout-overlap
 */
import {
  bboxesOverlap,
  detectCheckoutConflicts,
  geometriesOverlap,
  pointInPolygon,
  sharedObjectIds,
} from "../src/lib/checkout/overlap";
import {
  CheckoutSelectionType,
  CheckoutStatus,
  type CheckoutSelection,
  type ExistingCheckoutForOverlap,
} from "../src/lib/checkout/types";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const boxA = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
const boxB = { minX: 5, minY: 5, maxX: 15, maxY: 15 };
const boxSeparate = { minX: 20, minY: 20, maxX: 30, maxY: 30 };

const bboxA: CheckoutSelection = {
  geometry: {
    type: CheckoutSelectionType.BBOX,
    bbox: boxA,
  },
  objectIds: ["obj-1", "obj-2"],
};

const bboxB: CheckoutSelection = {
  geometry: {
    type: CheckoutSelectionType.BBOX,
    bbox: boxB,
  },
  objectIds: ["obj-3"],
};

const bboxSeparate: CheckoutSelection = {
  geometry: {
    type: CheckoutSelectionType.BBOX,
    bbox: boxSeparate,
  },
  objectIds: ["obj-9"],
};

const polygonRing: [number, number][] = [
  [8, 8],
  [12, 8],
  [12, 12],
  [8, 12],
];

const polygonOverlap: CheckoutSelection = {
  geometry: {
    type: CheckoutSelectionType.POLYGON,
    ring: polygonRing,
  },
  objectIds: ["obj-4"],
};

const existing: ExistingCheckoutForOverlap = {
  id: "checkout-1",
  userId: "user-1",
  userName: "Anna",
  userEmail: "anna@example.com",
  status: CheckoutStatus.ACTIVE,
  selectionType: CheckoutSelectionType.BBOX,
  selection: bboxA,
  createdAt: new Date("2026-08-01"),
};

assert(bboxesOverlap(boxA, boxB), "bbox overlap expected");
assert(!bboxesOverlap(boxA, boxSeparate), "bbox should not overlap");
assert(
  geometriesOverlap(bboxA.geometry, polygonOverlap.geometry),
  "bbox/polygon overlap expected",
);
assert(pointInPolygon(9, 9, polygonRing), "point should be inside polygon");
assert(sharedObjectIds(["a", "b"], ["b", "c"]).join() === "b", "shared object ids");

const geometryConflict = detectCheckoutConflicts(bboxB, [existing]);
assert(geometryConflict.length === 1, "geometry conflict expected");
assert(geometryConflict[0]?.reason === "geometry", "geometry reason expected");
assert(geometryConflict[0]?.message.includes("Anna"), "Swedish message should name owner");

const objectConflict = detectCheckoutConflicts(
  {
    geometry: {
      type: CheckoutSelectionType.BBOX,
      bbox: { minX: 100, minY: 100, maxX: 110, maxY: 110 },
    },
    objectIds: ["obj-2"],
  },
  [existing],
);
assert(objectConflict.length === 1, "object conflict expected");
assert(objectConflict[0]?.reason === "objectIds", "objectIds reason expected");

const noConflict = detectCheckoutConflicts(bboxSeparate, [existing]);
assert(noConflict.length === 0, "no conflict expected");

console.log("checkout overlap tests passed");
