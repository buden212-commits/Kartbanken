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

/** Hur säker användaren är på platsen på kartan (alternativ C). */
export const SuggestionLocationConfidence = {
  MYCKET_SAKER: "MYCKET_SAKER",
  GANSKA_SAKER: "GANSKA_SAKER",
  OSAKER: "OSAKER",
  BEHOVER_FALTVVERIFIERING: "BEHOVER_FALTVVERIFIERING",
} as const;

export type SuggestionLocationConfidenceValue =
  (typeof SuggestionLocationConfidence)[keyof typeof SuggestionLocationConfidence];

export const SUGGESTION_LOCATION_CONFIDENCE_LABELS: Record<
  SuggestionLocationConfidenceValue,
  string
> = {
  MYCKET_SAKER: "Mycket säker",
  GANSKA_SAKER: "Ganska säker",
  OSAKER: "Osäker",
  BEHOVER_FALTVVERIFIERING: "Behöver fältverifiering",
};

export const DEFAULT_SUGGESTION_LOCATION_CONFIDENCE: SuggestionLocationConfidenceValue =
  SuggestionLocationConfidence.GANSKA_SAKER;

export const SUGGESTION_LOCATION_CONFIDENCE_ORDER: SuggestionLocationConfidenceValue[] = [
  SuggestionLocationConfidence.MYCKET_SAKER,
  SuggestionLocationConfidence.GANSKA_SAKER,
  SuggestionLocationConfidence.OSAKER,
  SuggestionLocationConfidence.BEHOVER_FALTVVERIFIERING,
];

export function suggestionLocationConfidenceBadgeClass(
  value: SuggestionLocationConfidenceValue,
): string {
  switch (value) {
    case SuggestionLocationConfidence.MYCKET_SAKER:
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case SuggestionLocationConfidence.GANSKA_SAKER:
      return "border-sky-200 bg-sky-50 text-sky-900";
    case SuggestionLocationConfidence.OSAKER:
      return "border-amber-200 bg-amber-50 text-amber-900";
    case SuggestionLocationConfidence.BEHOVER_FALTVVERIFIERING:
      return "border-orange-200 bg-orange-50 text-orange-900";
  }
}

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

export type SuggestionPointIntent = "delete";

export type SuggestionPointGeometry = {
  type: "Point";
  coordinates: [number, number];
  /** Marks an existing map object for removal (rendered as X). */
  intent?: SuggestionPointIntent;
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
  /** OCAD symbol number for OCD export (e.g. GPS track line layer). */
  symbolNum?: number;
};

export type SuggestionGeometry =
  | SuggestionPointGeometry
  | SuggestionBboxGeometry
  | SuggestionPolygonGeometry
  | SuggestionLineGeometry;

export type SuggestionOverlayItem = {
  id: string;
  status: SuggestionStatusValue;
  /** Numrerad markering inom förslaget (t.ex. "1", "2"). */
  markingLabel: string;
  geometry: SuggestionGeometry;
};

export type SuggestionObjectDto = {
  id: string;
  objectType: SuggestionObjectTypeValue;
  geometry: SuggestionGeometry;
  sortOrder: number;
};

export type SuggestionUserRef = {
  id: string;
  name: string | null;
  email: string;
};

export type SuggestionSummary = {
  id: string;
  status: SuggestionStatusValue;
  category: SuggestionCategoryValue;
  locationConfidence: SuggestionLocationConfidenceValue;
  title: string | null;
  comment: string;
  createdAt: string;
  updatedAt: string;
  versionNumber: number;
  mapVersionId: string;
  /** True when suggestion targets an older published version than the latest */
  appliesToOlderVersion: boolean;
  hasAttachment: boolean;
  createdBy: SuggestionUserRef;
  reviewedAt: string | null;
  reviewedBy: SuggestionUserRef | null;
  objectCount: number;
};

export type SuggestionDetail = SuggestionSummary & {
  reviewComment: string | null;
  checkoutId: string | null;
  integratedVersionId: string | null;
  integratedVersionNumber: number | null;
  objects: SuggestionObjectDto[];
};

/** e.g. "Införd av Anna Svensson, 6 aug. 2026" — null for OPEN or missing reviewer data. */
export function formatSuggestionStatusAttribution(
  status: SuggestionStatusValue,
  reviewedBy: SuggestionUserRef | null,
  reviewedAt: string | null,
  formatDate: (date: string) => string,
): string | null {
  if (status === SuggestionStatus.OPEN || !reviewedBy || !reviewedAt) return null;
  const name = reviewedBy.name?.trim() || reviewedBy.email;
  const date = formatDate(reviewedAt);
  switch (status) {
    case SuggestionStatus.IN_PROGRESS:
      return `Pågår av ${name}, ${date}`;
    case SuggestionStatus.IMPLEMENTED:
      return `Införd av ${name}, ${date}`;
    case SuggestionStatus.REJECTED:
      return `Avvisad av ${name}, ${date}`;
    default:
      return null;
  }
}

export const MAX_OPEN_SUGGESTIONS_PER_USER_PER_MAP = 10;

export const MAX_SUGGESTION_GEOMETRIES = 20;

export const MAX_SUGGESTION_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const SUGGESTION_ATTACHMENT_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"] as const;
