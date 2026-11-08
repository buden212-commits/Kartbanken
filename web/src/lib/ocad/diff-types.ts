export type ChangeType = "added" | "removed" | "modified";

export type OcadObjectChange = {
  changeType: ChangeType;
  /**
   * Removed/modified: index in file A (baseline/export/head).
   * Added: index in file B (checkin).
   */
  objectIndex: number;
  /** Index in file B (checkin) for added/modified — source of new object bytes. */
  checkinObjectIndex?: number;
  symbolNumber: number;
  symbolName: string;
  type: import("./types").OcadObjectType;
  centroid: [number, number];
  bbox: [number, number, number, number];
  text?: string;
  geometryHash?: string;
  previousGeometryHash?: string;
  /** Set on modified changes where only/also the symbol changed (same geometry). */
  previousSymbolNumber?: number;
  previousSymbolName?: string;
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
  /** Ground distance; converted to paper units (0.01 mm) with `mapScale`. */
  toleranceMeters?: number;
  /** Map scale denominator (e.g. 10000). Object coordinates are paper units. */
  mapScale?: number;
  /**
   * Treat every matched pair whose geometryHash differs as modified (no tolerance).
   * Used for checkout check-ins where any edit must be integrated.
   */
  exactModified?: boolean;
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
