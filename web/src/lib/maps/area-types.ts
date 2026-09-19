export const AreaType = {
  SPRINT: "SPRINT",
  MTBO: "MTBO",
  SKIDO: "SKIDO",
  ORIENTEERING: "ORIENTEERING",
} as const;

export type AreaType = (typeof AreaType)[keyof typeof AreaType];

export const DEFAULT_AREA_TYPE: AreaType = AreaType.ORIENTEERING;

export const AREA_TYPE_ORDER: AreaType[] = [
  AreaType.ORIENTEERING,
  AreaType.SPRINT,
  AreaType.MTBO,
  AreaType.SKIDO,
];

export const AREA_TYPE_LABELS: Record<AreaType, string> = {
  ORIENTEERING: "Orientering",
  SPRINT: "Sprint",
  MTBO: "MTBO",
  SKIDO: "SkidO",
};

export function isAreaType(value: unknown): value is AreaType {
  return typeof value === "string" && value in AREA_TYPE_LABELS;
}

export function parseAreaType(value: unknown): AreaType | null {
  if (!isAreaType(value)) return null;
  return value;
}

export function coerceAreaType(value: unknown): AreaType {
  return parseAreaType(value) ?? DEFAULT_AREA_TYPE;
}
