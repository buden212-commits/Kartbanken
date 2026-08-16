import type { Bbox, CheckoutSelectionGeometry } from "./types";
import type { OcadObjectType } from "@/lib/ocad/types";
import type { ChangeType } from "@/lib/ocad/diff-types";

export type ImportSymbolRow = {
  number: number;
  nameHead: string;
  namePartial: string;
  countPartial: number;
};

export type ImportEdgeObject = {
  objectIndex: number;
  symbolNumber: number;
  symbolName: string;
  type: OcadObjectType;
  centroid: [number, number];
  bbox: [number, number, number, number];
  likelyClipped: boolean;
};

export type ImportDiffSample = {
  changeType: ChangeType;
  objectIndex: number;
  symbolNumber: number;
  symbolName: string;
  type: OcadObjectType;
  centroid: [number, number];
  bbox: [number, number, number, number];
};

/** Objekt i riskzonen som skulle raderats men skyddas tills redaktören väljer «Radera». */
export type ImportRiskRemoval = {
  objectIndex: number;
  symbolNumber: number;
  symbolName: string;
  type: OcadObjectType;
  centroid: [number, number];
  bbox: [number, number, number, number];
};

export type ImportPartialAnalysis = {
  /** Automatisk AABB från delkartans objekt (blå start-ram). */
  extent: Bbox;
  /** Aktiv importgräns (AABB eller ritad polygon). */
  boundary: CheckoutSelectionGeometry;
  riskZoneMeters: number;
  extentInsideHead: boolean;
  headBounds: Bbox | null;
  symbols: {
    matched: ImportSymbolRow[];
    onlyInPartial: ImportSymbolRow[];
    onlyInHeadUsedByPartialArea: ImportSymbolRow[];
  };
  interiorCount: number;
  edgeCount: number;
  likelyClippedCount: number;
  edgeObjects: ImportEdgeObject[];
  /** Skyddade borttagningskandidater i riskzonen (default: behåll). */
  riskRemovals: ImportRiskRemoval[];
  diff: {
    added: number;
    removed: number;
    modified: number;
    unchanged: number;
    samples: ImportDiffSample[];
    /** Fler punkter för kartöverlagring (kan vara fler än samples). */
    mapChanges: ImportDiffSample[];
  };
  blockers: string[];
  warnings: string[];
};
