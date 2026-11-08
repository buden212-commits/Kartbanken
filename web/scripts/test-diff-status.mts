/**
 * Kör: npm run test:diff-status
 * Tillståndsmaskin för checkout-diff: lease, timeout, kapplöpning vid ny incheckning.
 */
import {
  CHECKOUT_DIFF_LEASE_MS,
  CHECKOUT_DIFF_MAX_ATTEMPTS,
  CHECKOUT_DIFF_RESPONSE_MAX_CHANGES,
  decideCheckoutDiffClaim,
  isCheckoutDiffStale,
  truncateDiffSummaryForResponse,
  type CheckoutDiffSummary,
} from "../src/lib/checkout/diff-status";
import { buildCheckinReviewChecks } from "../src/lib/checkout/checkin-review-checks";
import { parseSelectionPayload } from "../src/lib/checkout/create-checkout";
import { CheckoutSelectionType } from "../src/lib/checkout/types";
import {
  compatibleOcadExportVersions,
  isCompatibleExportVersion,
  ocadHeaderVersionValue,
} from "../src/lib/ocad/ocad-export-shared";
import type { OcadObjectChange } from "../src/lib/ocad/diff-types";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function pending(fields: Record<string, unknown>): string {
  return JSON.stringify({ _status: "pending", startedAt: "2026-01-01T00:00:00.000Z", ...fields });
}

const t0 = Date.parse("2026-01-01T00:00:00.000Z");

assert(
  decideCheckoutDiffClaim(null, t0).action === "claim",
  "empty JSON should be claimed",
);

const queued = decideCheckoutDiffClaim(pending({ checkinStoragePath: "a.ocd" }), t0, "a.ocd");
assert(queued.action === "claim", "queued without attemptStartedAt should be claimed, not timed out");
assert(!isCheckoutDiffStale(pending({ checkinStoragePath: "a.ocd" }), t0, "a.ocd"), "never-started is not stale");

const live = decideCheckoutDiffClaim(
  pending({
    checkinStoragePath: "a.ocd",
    attemptId: "1",
    attemptStartedAt: new Date(t0).toISOString(),
    attempts: 1,
  }),
  t0 + CHECKOUT_DIFF_LEASE_MS - 1,
  "a.ocd",
);
assert(live.action === "skip" && live.reason === "lease_active", "active lease must skip");

const expired = decideCheckoutDiffClaim(
  pending({
    checkinStoragePath: "a.ocd",
    attemptId: "1",
    attemptStartedAt: new Date(t0).toISOString(),
    attempts: 1,
  }),
  t0 + CHECKOUT_DIFF_LEASE_MS + 1,
  "a.ocd",
);
assert(expired.action === "claim", "expired lease with remaining attempts should retry");

const stale = decideCheckoutDiffClaim(
  pending({
    checkinStoragePath: "a.ocd",
    attemptId: "1",
    attemptStartedAt: new Date(t0).toISOString(),
    attempts: CHECKOUT_DIFF_MAX_ATTEMPTS,
  }),
  t0 + CHECKOUT_DIFF_LEASE_MS + 1,
  "a.ocd",
);
assert(stale.action === "stale", "max attempts after lease expiry is stale");
assert(
  isCheckoutDiffStale(
    pending({
      checkinStoragePath: "a.ocd",
      attemptId: "1",
      attemptStartedAt: new Date(t0).toISOString(),
      attempts: CHECKOUT_DIFF_MAX_ATTEMPTS,
    }),
    t0 + CHECKOUT_DIFF_LEASE_MS + 1,
    "a.ocd",
  ),
  "isCheckoutDiffStale should match stale decision",
);

const race = decideCheckoutDiffClaim(
  JSON.stringify({
    added: 1,
    removed: 0,
    modified: 0,
    checkinStoragePath: "old.ocd",
    changes: [],
  }),
  t0,
  "new.ocd",
);
assert(race.action === "claim", "a ready diff for another checkin file must be recomputed");

const readySame = decideCheckoutDiffClaim(
  JSON.stringify({
    added: 0,
    removed: 0,
    modified: 0,
    checkinStoragePath: "a.ocd",
    changes: [],
  }),
  t0,
  "a.ocd",
);
assert(readySame.action === "skip" && readySame.reason === "done", "matching ready diff is kept");

const truncated = truncateDiffSummaryForResponse({
  added: 1,
  removed: 0,
  modified: 0,
  changes: Array.from({ length: CHECKOUT_DIFF_RESPONSE_MAX_CHANGES + 5 }, (_, i) => ({ i })),
} as CheckoutDiffSummary);
assert(truncated.changesTruncated === true, "GET payload should flag truncation");
assert(truncated.changes?.length === CHECKOUT_DIFF_RESPONSE_MAX_CHANGES, "GET payload is capped");
assert(truncated.totalChanges === CHECKOUT_DIFF_RESPONSE_MAX_CHANGES + 5, "totalChanges keeps the full count");

assert(ocadHeaderVersionValue(18) === 2018, "OCAD 2018 header must be 2018, not 18");
assert(ocadHeaderVersionValue(12) === 12, "OCAD 12 header stays 12");
assert(isCompatibleExportVersion(12, 18), "12 and 2018 share an object format");
assert(!isCompatibleExportVersion(11, 12), "11 cannot be saved as 12");
assert(
  compatibleOcadExportVersions(11).every((entry) => entry.value === 11),
  "OCAD 11 only offers 11",
);

assert(
  parseSelectionPayload(CheckoutSelectionType.BBOX, {
    geometry: { type: "BBOX", bbox: { minX: 0, minY: 0, maxX: 10, maxY: 10 } },
    objectIds: ["client-must-be-ignored"],
  })?.objectIds.length === 0,
  "client objectIds are ignored",
);
assert(
  parseSelectionPayload(CheckoutSelectionType.BBOX, {
    geometry: { type: "BBOX", bbox: { minX: 5, minY: 0, maxX: 5, maxY: 10 } },
  }) === null,
  "degenerate bbox is rejected",
);
assert(
  parseSelectionPayload(CheckoutSelectionType.POLYGON, {
    geometry: {
      type: "POLYGON",
      ring: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
    },
  }) != null,
  "simple polygon is accepted",
);
assert(
  parseSelectionPayload(CheckoutSelectionType.POLYGON, {
    geometry: {
      type: "POLYGON",
      ring: [
        [0, 0],
        [1, 0],
        [2, 0],
      ],
    },
  }) === null,
  "zero-area polygon is rejected",
);

function change(
  changeType: OcadObjectChange["changeType"],
  symbolNumber: number,
  centroid: [number, number] = [0, 0],
): OcadObjectChange {
  return {
    changeType,
    objectIndex: 1,
    symbolNumber,
    symbolName: `S${symbolNumber}`,
    type: "point",
    centroid,
    bbox: [centroid[0], centroid[1], centroid[0], centroid[1]],
    geometryHash: "h",
  };
}

const missingSymbol = buildCheckinReviewChecks({
  changes: [change("added", 999)],
  baselineObjectCount: 50,
  unchangedCount: 49,
  baselineSymbolNums: [101],
  checkinSymbolNums: [101, 999],
});
assert(missingSymbol.blockingErrors.length === 1, "missing symbol is blocking");
assert(missingSymbol.warnings.some((w) => w.toLowerCase().includes("symbol")), "symbol table warning");

const wrongFile = buildCheckinReviewChecks({
  changes: Array.from({ length: 250 }, () => change("added", 101)),
  baselineObjectCount: 50,
  unchangedCount: 5,
  baselineSymbolNums: [101],
  checkinSymbolNums: [101],
});
assert(
  wrongFile.warnings[0]?.toLowerCase().includes("fel fil") ||
    wrongFile.warnings.some((w) => w.toLowerCase().includes("fel")),
  `expected wrong-file warning, got: ${wrongFile.warnings.join(" | ")}`,
);

console.log("diff-status tests passed");
