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
  /** Unpadded utbredning för den importerade filen (crop/diff). */
  importExtent?: Bbox;
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

function importFields(record: Record<string, unknown>): Pick<CheckoutSelection, "importPartial" | "importExtent"> {
  const importExtent = record.importPartial === true ? parseBbox(record.importExtent) ?? undefined : undefined;
  return {
    importPartial: record.importPartial === true,
    ...(importExtent ? { importExtent } : {}),
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
