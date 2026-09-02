import type { Bbox } from "./types";
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

export type ImportPartialAnalysis = {
  extent: Bbox;
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
