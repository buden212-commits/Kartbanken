export const SuggestionStatus = {
  OPEN: "OPEN",
  IN_PROGRESS: "IN_PROGRESS",
  IMPLEMENTED: "IMPLEMENTED",
  REJECTED: "REJECTED",
} as const;

export type SuggestionStatusValue =
  (typeof SuggestionStatus)[keyof typeof SuggestionStatus];

export const SuggestionCategory = {
  FEL_I_TERRANG: "FEL_I_TERRANG",
  SAKNAS: "SAKNAS",
  FORKLARANDE: "FORKLARANDE",
  ANNAT: "ANNAT",
} as const;

export type SuggestionCategoryValue =
  (typeof SuggestionCategory)[keyof typeof SuggestionCategory];

export const SUGGESTION_CATEGORY_LABELS: Record<SuggestionCategoryValue, string> = {
  FEL_I_TERRANG: "Fel i terräng",
  SAKNAS: "Saknas i kartan",
  FORKLARANDE: "Förklaring",
  ANNAT: "Annat",
};

export const SUGGESTION_STATUS_LABELS: Record<SuggestionStatusValue, string> = {
  OPEN: "Öppen",
  IN_PROGRESS: "Pågår",
  IMPLEMENTED: "Införd",
  REJECTED: "Avvisad",
};

export const SuggestionObjectType = {
  POINT: "POINT",
  BBOX: "BBOX",
  POLYGON: "POLYGON",
  LINE: "LINE",
} as const;

export type SuggestionObjectTypeValue =
  (typeof SuggestionObjectType)[keyof typeof SuggestionObjectType];

export type SuggestionPointGeometry = {
  type: "Point";
  coordinates: [number, number];
};

export type SuggestionBbox = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type SuggestionBboxGeometry = {
  type: "Bbox";
  bbox: SuggestionBbox;
};

export type SuggestionPolygonGeometry = {
  type: "Polygon";
  ring: [number, number][];
};

export type SuggestionLineGeometry = {
  type: "LineString";
  coordinates: [number, number][];
};

export type SuggestionGeometry =
  | SuggestionPointGeometry
  | SuggestionBboxGeometry
  | SuggestionPolygonGeometry
  | SuggestionLineGeometry;

export type SuggestionOverlayItem = {
  id: string;
  status: SuggestionStatusValue;
  categoryLabel: string;
  geometry: SuggestionGeometry;
};

export type SuggestionObjectDto = {
  id: string;
  objectType: SuggestionObjectTypeValue;
  geometry: SuggestionGeometry;
  sortOrder: number;
};

export type SuggestionSummary = {
  id: string;
  status: SuggestionStatusValue;
  category: SuggestionCategoryValue;
  title: string | null;
  comment: string;
  createdAt: string;
  updatedAt: string;
  versionNumber: number;
  mapVersionId: string;
  /** True when suggestion targets an older published version than the latest */
  appliesToOlderVersion: boolean;
  hasAttachment: boolean;
  createdBy: {
    id: string;
    name: string | null;
    email: string;
  };
  objectCount: number;
};

export type SuggestionDetail = SuggestionSummary & {
  reviewComment: string | null;
  reviewedAt: string | null;
  reviewedBy: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  checkoutId: string | null;
  integratedVersionId: string | null;
  integratedVersionNumber: number | null;
  objects: SuggestionObjectDto[];
};

export const MAX_OPEN_SUGGESTIONS_PER_USER_PER_MAP = 10;

export const MAX_SUGGESTION_GEOMETRIES = 20;

export const MAX_SUGGESTION_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const SUGGESTION_ATTACHMENT_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"] as const;
