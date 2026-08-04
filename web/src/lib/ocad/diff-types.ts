export type ChangeType = "added" | "removed" | "modified";

export type OcadObjectChange = {
  changeType: ChangeType;
  objectIndex: number;
  symbolNumber: number;
  symbolName: string;
  type: import("./types").OcadObjectType;
  centroid: [number, number];
  bbox: [number, number, number, number];
  text?: string;
  geometryHash?: string;
  previousGeometryHash?: string;
};

export type SymbolDiffSummary = {
  symbolNumber: number;
  symbolName: string;
  added: number;
  removed: number;
  modified: number;
};

export type OcadDiffResult = {
  versionA: { fileName: string; objectCount: number };
  versionB: { fileName: string; objectCount: number };
  durationMs: number;
  toleranceMeters: number;
  added: number;
  removed: number;
  modified: number;
  unchanged: number;
  bySymbol: SymbolDiffSummary[];
  changes: OcadObjectChange[];
};

export type OcadDiffOptions = {
  toleranceMeters?: number;
  maxChanges?: number;
  /**
   * Prefer pairing objects with the same OCAD objectIndex before spatial matching.
   * Use for checkout export↔checkin where indices are stable across edits.
   */
  matchByObjectIndex?: boolean;
};
