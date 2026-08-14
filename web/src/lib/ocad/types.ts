export type OcadObjectType = "point" | "line" | "area" | "text" | "unknown";

export type NormalizedOcadObject = {
  objectIndex: number;
  symbolNumber: number;
  symbolName: string;
  type: OcadObjectType;
  centroid: [number, number];
  bbox: [number, number, number, number];
  geometryHash: string;
  /** Vertex-koordinater för linjer (Hausdorff-jämförelse). */
  vertices?: [number, number][];
  text?: string;
};

export type OcadParseSummary = {
  fileName: string;
  fileSizeBytes: number;
  parseDurationMs: number;
  ocadVersion: number;
  objectCount: number;
  symbolCount: number;
  /** Alla symbolnummer i filens symboltabell (även oanvända). */
  symbolNums: number[];
  warnings: string[];
  byType: Record<OcadObjectType, number>;
  topSymbols: Array<{
    symbolNumber: number;
    symbolName: string;
    count: number;
  }>;
  bounds: number[] | null;
  objects: NormalizedOcadObject[];
};
