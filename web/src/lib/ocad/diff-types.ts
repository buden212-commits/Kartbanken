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
  /** Antal poster i changes (samma som changes.length om inte trunkerat vid lagring). */
  totalChanges: number;
  changesTruncated: boolean;
  maxChangesApplied: number | null;
};

export type OcadDiffOptions = {
  toleranceMeters?: number;
  /**
   * @deprecated Diff-motorn returnerar alla ändringar. Använd limitStoredChanges vid lagring.
   */
  maxChanges?: number;
  /**
   * After exact geometryHash matching, also pair remaining objects with the same
   * OCAD objectIndex (before spatial nearest-centroid). Default true.
   * Set false for import-partial / reindex-safe paths.
   */
  matchByObjectIndex?: boolean;
};
