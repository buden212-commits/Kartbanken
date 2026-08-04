/**
 * Kör: npx tsx scripts/test-integration-warnings.mts
 */
import {
  buildAddedNotIntegratedWarning,
  collectWarningObjectIndices,
  integrationWarningsToStrings,
  parseLocationCentroid,
  warningObjectsToChanges,
} from "../src/lib/checkout/integration-warnings";
import type { OcadObjectChange } from "../src/lib/ocad/diff-types";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const added: OcadObjectChange[] = [
  {
    changeType: "added",
    objectIndex: 76108,
    symbolNumber: 109000,
    symbolName: "Punkthöjd",
    type: "point",
    centroid: [24032, -54050],
    bbox: [24032, -54050, 24032, -54050],
    geometryHash: "abc",
  },
  {
    changeType: "added",
    objectIndex: 76107,
    symbolNumber: 419000,
    symbolName: "Speciellt vegetationsföremål",
    type: "point",
    centroid: [23447, -54573],
    bbox: [23447, -54573, 23447, -54573],
    geometryHash: "def",
  },
];

const warning = buildAddedNotIntegratedWarning(added);
assert(!!warning, "expected warning");
assert(warning!.objects.length === 2, "expected 2 objects");
assert(warning!.objects[0]?.symbolName === "Punkthöjd", "expected symbol name");

const lines = integrationWarningsToStrings([warning!]);
assert(lines.some((line) => line.includes("109000")), "expected symbol in flattened output");
assert(lines.some((line) => line.includes("76108")), "expected index in flattened output");

assert(warning!.objects[0]?.centroid?.[0] === 24032, "expected centroid on detail");
assert(collectWarningObjectIndices([warning!]).length === 2, "expected 2 indices");
assert(warningObjectsToChanges([warning!]).length === 2, "expected map changes");
assert(
  parseLocationCentroid("(-58245, -6976)")?.[0] === -58245,
  "expected location parse",
);

console.log("integration warnings tests passed");
