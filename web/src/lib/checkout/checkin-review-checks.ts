import { filterObjectsInSelection } from "./selection-objects";
import type { CheckoutSelectionGeometry } from "./types";
import type { OcadObjectChange } from "@/lib/ocad/diff-types";
import type { NormalizedOcadObject } from "@/lib/ocad/types";

export type CheckinReviewChecks = {
  /** Integration is refused while any of these remain. */
  blockingErrors: string[];
  warnings: string[];
};

export type CheckinReviewInput = {
  changes: OcadObjectChange[];
  baselineObjectCount: number;
  /** Unchanged = baseline objects matched 1:1 in the checkin. */
  unchangedCount: number;
  baselineSymbolNums: number[];
  checkinSymbolNums: number[];
  baselineSymbolHashes?: Record<number, string>;
  checkinSymbolHashes?: Record<number, string>;
  /** Omitted for imported partial maps (their area is the import polygon). */
  selectionGeometry?: CheckoutSelectionGeometry;
};

/** Below this many baseline objects the "wrong file" heuristic is too noisy. */
const WRONG_FILE_MIN_BASELINE = 20;
const WRONG_FILE_MAX_KEPT_RATIO = 0.2;
const WRONG_FILE_MIN_ADDED = 200;
const WRONG_FILE_MAX_ADDED_RATIO = 3;

function formatSymbol(symbolNumber: number, symbolName: string): string {
  return symbolName ? `${symbolNumber} ${symbolName}` : String(symbolNumber);
}

function sampleList(items: string[], max = 5): string {
  const shown = items.slice(0, max).join("; ");
  return items.length > max ? `${shown} — plus ${items.length - max} till` : shown;
}

export function buildCheckinReviewChecks(input: CheckinReviewInput): CheckinReviewChecks {
  const blockingErrors: string[] = [];
  const warnings: string[] = [];

  const baselineSymbols = new Set(input.baselineSymbolNums);
  const checkinSymbols = new Set(input.checkinSymbolNums);

  // Integration copies object records only, never symbol definitions.
  if (baselineSymbols.size > 0) {
    const missing = new Map<number, { name: string; count: number }>();
    for (const change of input.changes) {
      if (change.changeType === "removed") continue;
      if (baselineSymbols.has(change.symbolNumber)) continue;
      const entry = missing.get(change.symbolNumber) ?? { name: change.symbolName, count: 0 };
      entry.count += 1;
      missing.set(change.symbolNumber, entry);
    }
    if (missing.size > 0) {
      const total = [...missing.values()].reduce((sum, entry) => sum + entry.count, 0);
      const samples = [...missing.entries()].map(
        ([symbolNumber, entry]) => `${formatSymbol(symbolNumber, entry.name)} ×${entry.count}`,
      );
      blockingErrors.push(
        `${total} objekt använder symboler som saknas i kartans symboltabell: ${sampleList(samples)}. ` +
          "Byt till en befintlig symbol i OCAD och checka in igen, eller be admin lägga till symbolen i grundkartan först.",
      );
    }

    const newSymbols = [...checkinSymbols].filter((n) => !baselineSymbols.has(n));
    const droppedSymbols = [...baselineSymbols].filter((n) => !checkinSymbols.has(n));
    const editedSymbols =
      input.baselineSymbolHashes && input.checkinSymbolHashes
        ? [...checkinSymbols].filter((n) => {
            const before = input.baselineSymbolHashes![n];
            const after = input.checkinSymbolHashes![n];
            return before != null && after != null && before !== after;
          })
        : [];
    if (
      checkinSymbols.size > 0 &&
      (newSymbols.length > 0 || droppedSymbols.length > 0 || editedSymbols.length > 0)
    ) {
      const parts: string[] = [];
      if (newSymbols.length > 0) {
        parts.push(`${newSymbols.length} nya (${sampleList(newSymbols.map(String), 8)})`);
      }
      if (droppedSymbols.length > 0) {
        parts.push(`${droppedSymbols.length} borttagna (${sampleList(droppedSymbols.map(String), 8)})`);
      }
      if (editedSymbols.length > 0) {
        parts.push(`${editedSymbols.length} ändrade (${sampleList(editedSymbols.map(String), 8)})`);
      }
      warnings.push(
        `Symboltabellen i incheckningen skiljer sig från grundkartan: ${parts.join(", ")}. ` +
          "Ändringar i symboler förs inte över vid integrering — bara kartobjekten.",
      );
    }
  }

  if (input.selectionGeometry) {
    const added = input.changes.filter((change) => change.changeType === "added");
    if (added.length > 0) {
      const asObjects: NormalizedOcadObject[] = added.map((change) => ({
        objectIndex: change.objectIndex,
        symbolNumber: change.symbolNumber,
        symbolName: change.symbolName,
        type: change.type,
        centroid: change.centroid,
        bbox: change.bbox,
        geometryHash: change.geometryHash ?? "",
      }));
      const inside = new Set(
        filterObjectsInSelection(asObjects, input.selectionGeometry).map((o) => o.objectIndex),
      );
      const outside = added.filter((change) => !inside.has(change.objectIndex));
      if (outside.length > 0) {
        warnings.push(
          `${outside.length} tillagd${outside.length === 1 ? "" : "a"} objekt ligger helt utanför det utcheckade området och kan krocka med andras arbete: ` +
            `${sampleList(outside.map((c) => `${formatSymbol(c.symbolNumber, c.symbolName)} (index ${c.objectIndex})`))}.`,
        );
      }
    }
  }

  const removedCount = input.changes.filter((change) => change.changeType === "removed").length;
  const addedCount = input.changes.filter((change) => change.changeType === "added").length;
  if (
    input.baselineObjectCount >= WRONG_FILE_MIN_BASELINE &&
    input.unchangedCount / input.baselineObjectCount < WRONG_FILE_MAX_KEPT_RATIO
  ) {
    warnings.unshift(
      `Fel fil? Bara ${input.unchangedCount} av ${input.baselineObjectCount} objekt från utcheckningen finns kvar oförändrade ` +
        `(${removedCount} borttagna, ${addedCount} tillagda). Kontrollera att du checkat in rätt fil innan integrering.`,
    );
  } else if (
    addedCount >= WRONG_FILE_MIN_ADDED &&
    addedCount > input.baselineObjectCount * WRONG_FILE_MAX_ADDED_RATIO
  ) {
    warnings.unshift(
      `Fel fil? Incheckningen lägger till ${addedCount} objekt, men utcheckningen innehöll bara ${input.baselineObjectCount}. ` +
        "Har hela kartan eller en annan utchecknings fil laddats upp? Kontrollera innan integrering.",
    );
  }

  return { blockingErrors, warnings };
}
