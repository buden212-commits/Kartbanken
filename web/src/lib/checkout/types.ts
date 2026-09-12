export const CheckoutMode = {
  OCAD_DESKTOP: "OCAD_DESKTOP",
  FIELD_EDIT: "FIELD_EDIT",
} as const;

export type CheckoutMode = (typeof CheckoutMode)[keyof typeof CheckoutMode];

export const CheckoutStatus = {
  ACTIVE: "ACTIVE",
  CHECKED_IN: "CHECKED_IN",
  PENDING_USER_CONFIRM: "PENDING_USER_CONFIRM",
  PENDING_ADMIN_CONFIRM: "PENDING_ADMIN_CONFIRM",
  INTEGRATED: "INTEGRATED",
  CANCELLED: "CANCELLED",
} as const;

export type CheckoutStatus = (typeof CheckoutStatus)[keyof typeof CheckoutStatus];

export const CheckoutSelectionType = {
  BBOX: "BBOX",
  POLYGON: "POLYGON",
} as const;

export type CheckoutSelectionType =
  (typeof CheckoutSelectionType)[keyof typeof CheckoutSelectionType];

/** Statuses that hold an exclusive area lock (overlap checks). */
export const LOCKING_CHECKOUT_STATUSES: CheckoutStatus[] = [
  CheckoutStatus.ACTIVE,
  CheckoutStatus.CHECKED_IN,
  CheckoutStatus.PENDING_ADMIN_CONFIRM,
];

export type Bbox = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type PolygonRing = [number, number][];

export type CheckoutSelectionGeometry =
  | { type: typeof CheckoutSelectionType.BBOX; bbox: Bbox }
  | { type: typeof CheckoutSelectionType.POLYGON; ring: PolygonRing };

export type CheckoutSelection = {
  geometry: CheckoutSelectionGeometry;
  objectIds: string[];
  /** True when checkout was created from an imported partial map (no prior checkout). */
  importPartial?: boolean;
  /** Unpadded utbredning (AABB) för den importerade filen (crop). */
  importExtent?: Bbox;
  /** Unpadded polygon för importerad delkarta (diff/kantfilter). */
  importRing?: PolygonRing;
  /** Skyddad kantzon (meter) innanför importRing — objekt där tas aldrig bort automatiskt. */
  importEdgeBuffer?: number;
  /**
   * Ändringar som redaktören kryssat bort i importguiden, som «removed:1234».
   * De hoppas över i incheckningens diff och når därför aldrig kartan.
   */
  importExcluded?: string[];
};

export type CheckoutSelectionInput = {
  selectionType: CheckoutSelectionType;
  selection: CheckoutSelection;
};

export type ExistingCheckoutForOverlap = {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  status: CheckoutStatus;
  selectionType: CheckoutSelectionType;
  selection: CheckoutSelection;
  createdAt: Date;
};

export type CheckoutOverlapConflict = {
  checkoutId: string;
  userId: string;
  userLabel: string;
  reason: "geometry" | "objectIds" | "both";
  overlappingObjectIds: string[];
  message: string;
};

export function parseBbox(value: unknown): Bbox | null {
  if (!value || typeof value !== "object") return null;
  const bbox = value as Record<string, unknown>;
  const minX = Number(bbox.minX);
  const minY = Number(bbox.minY);
  const maxX = Number(bbox.maxX);
  const maxY = Number(bbox.maxY);
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
  return { minX, minY, maxX, maxY };
}

function parsePolygonRing(value: unknown): PolygonRing | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const ring: PolygonRing = [];
  for (const point of value) {
    if (!Array.isArray(point) || point.length < 2) return null;
    const x = Number(point[0]);
    const y = Number(point[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    ring.push([x, y]);
  }
  return ring.length >= 3 ? ring : null;
}

const IMPORT_EXCLUDED_PATTERN = /^(added|removed|modified):\d+$/;

function parseExcludedKeys(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const keys = [
    ...new Set(
      value.filter((item): item is string => typeof item === "string" && IMPORT_EXCLUDED_PATTERN.test(item)),
    ),
  ];
  return keys.length > 0 ? keys : null;
}

function importFields(
  record: Record<string, unknown>,
): Pick<
  CheckoutSelection,
  "importPartial" | "importExtent" | "importRing" | "importEdgeBuffer" | "importExcluded"
> {
  if (record.importPartial !== true) {
    return { importPartial: false };
  }
  const importExtent = parseBbox(record.importExtent) ?? undefined;
  const importRing = parsePolygonRing(record.importRing) ?? undefined;
  const rawBuffer = record.importEdgeBuffer;
  const importEdgeBuffer =
    typeof rawBuffer === "number" && Number.isFinite(rawBuffer) && rawBuffer > 0
      ? rawBuffer
      : undefined;
  const importExcluded = parseExcludedKeys(record.importExcluded) ?? undefined;
  return {
    importPartial: true,
    ...(importExtent ? { importExtent } : {}),
    ...(importRing ? { importRing } : {}),
    ...(importEdgeBuffer ? { importEdgeBuffer } : {}),
    ...(importExcluded ? { importExcluded } : {}),
  };
}

export function parseSelectionJson(raw: string): CheckoutSelection {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Ogiltigt selectionJson");
  }

  const record = parsed as Record<string, unknown>;
  const objectIds = Array.isArray(record.objectIds)
    ? record.objectIds.filter((id): id is string => typeof id === "string")
    : [];

  const geometry = record.geometry;
  if (!geometry || typeof geometry !== "object") {
    throw new Error("selectionJson saknar geometry");
  }

  const geom = geometry as Record<string, unknown>;
  if (geom.type === CheckoutSelectionType.BBOX) {
    const bbox = parseBbox(geom.bbox);
    if (!bbox) throw new Error("BBOX saknar bbox");
    return {
      geometry: {
        type: CheckoutSelectionType.BBOX,
        bbox,
      },
      objectIds,
      ...importFields(record),
    };
  }

  if (geom.type === CheckoutSelectionType.POLYGON) {
    const ring = geom.ring;
    if (!Array.isArray(ring) || ring.length < 3) {
      throw new Error("POLYGON saknar giltig ring");
    }
    const normalized: PolygonRing = ring.map((point) => {
      if (!Array.isArray(point) || point.length < 2) {
        throw new Error("Ogiltig polygonpunkt");
      }
      return [Number(point[0]), Number(point[1])] as [number, number];
    });
    return {
      geometry: { type: CheckoutSelectionType.POLYGON, ring: normalized },
      objectIds,
      ...importFields(record),
    };
  }

  throw new Error("Okänd geometrityp i selectionJson");
}

export function serializeSelection(selection: CheckoutSelection): string {
  return JSON.stringify(selection);
}

export function checkoutModeLabel(mode: CheckoutMode): string {
  switch (mode) {
    case CheckoutMode.FIELD_EDIT:
      return "Fältredigering";
    case CheckoutMode.OCAD_DESKTOP:
    default:
      return "OCAD-utcheckning";
  }
}

export function checkoutStatusLabel(status: CheckoutStatus): string {
  switch (status) {
    case CheckoutStatus.ACTIVE:
      return "Aktiv";
    case CheckoutStatus.CHECKED_IN:
      return "Incheckad";
    case CheckoutStatus.PENDING_USER_CONFIRM:
      return "Väntar på användarbekräftelse";
    case CheckoutStatus.PENDING_ADMIN_CONFIRM:
      return "Väntar på admin-bekräftelse";
    case CheckoutStatus.INTEGRATED:
      return "Integrerad";
    case CheckoutStatus.CANCELLED:
      return "Avbruten";
    default:
      return status;
  }
}
