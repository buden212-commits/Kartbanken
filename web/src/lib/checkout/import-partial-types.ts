import type { Bbox, PolygonRing } from "./types";
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
  /** Omslutande rektangel (för zoom/bakåtkompatibilitet). */
  extent: Bbox;
  /** Faktiskt jämförelseområde — konkav hull av delkartans objekt. */
  ring: PolygonRing;
  /** Inre kärna (ring krympt med edgeBufferMeters); tom om utsnittet är för litet. */
  coreRing: PolygonRing;
  /** Kantzon i meter där borttag på stora kartan skyddas. */
  edgeBufferMeters: number;
  /** Antal objekt på stora kartan som faktiskt jämförs (efter AABB+polygon). */
  headObjectsInArea: number;
  /** Totalt antal objekt på stora kartan (för status). */
  headObjectsTotal: number;
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
