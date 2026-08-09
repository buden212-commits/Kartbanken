import type { OcadObjectChange } from "@/lib/ocad/diff-types";
import type { OcadObjectType } from "@/lib/ocad/types";

export type IntegrationObjectDetail = {
  objectIndex: number;
  symbolNumber: number;
  symbolName: string;
  type: OcadObjectType;
  typeLabel: string;
  location: string;
  centroid?: [number, number];
  bbox?: [number, number, number, number];
  text?: string;
};

export type IntegrationWarning = {
  code: "added_not_integrated" | "modified_copy_skipped" | "out_of_scope";
  title: string;
  reason: string;
  objects: IntegrationObjectDetail[];
};

const TYPE_LABELS: Record<OcadObjectType, string> = {
  point: "punkt",
  line: "linje",
  area: "yta",
  text: "text",
  unknown: "objekt",
};

export function objectTypeLabel(type: OcadObjectType): string {
  return TYPE_LABELS[type] ?? "objekt";
}

export function formatObjectLocation(centroid: [number, number]): string {
  return `(${Math.round(centroid[0])}, ${Math.round(centroid[1])})`;
}

export function changeToObjectDetail(change: OcadObjectChange): IntegrationObjectDetail {
  return {
    objectIndex: change.objectIndex,
    symbolNumber: change.symbolNumber,
    symbolName: change.symbolName,
    type: change.type,
    typeLabel: objectTypeLabel(change.type),
    location: formatObjectLocation(change.centroid),
    centroid: change.centroid,
    bbox: change.bbox,
    text: change.text,
  };
}

/** Parse "(x, y)" location strings from older stored warnings. */
export function parseLocationCentroid(location: string): [number, number] | null {
  const match = location.match(/^\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)$/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2])];
}

export function resolveObjectCentroid(
  obj: IntegrationObjectDetail,
): [number, number] | null {
  if (obj.centroid) return obj.centroid;
  return parseLocationCentroid(obj.location);
}

export function resolveObjectBbox(
  obj: IntegrationObjectDetail,
): [number, number, number, number] | null {
  if (obj.bbox) return obj.bbox;
  const centroid = resolveObjectCentroid(obj);
  if (!centroid) return null;
  const pad = obj.type === "point" || obj.type === "text" ? 15 : 40;
  return [centroid[0] - pad, centroid[1] - pad, centroid[0] + pad, centroid[1] + pad];
}

export function collectWarningObjectIndices(warnings: IntegrationWarning[]): number[] {
  const indices = new Set<number>();
  for (const warning of warnings) {
    for (const obj of warning.objects) {
      indices.add(obj.objectIndex);
    }
  }
  return [...indices];
}

export function warningObjectsToChanges(
  warnings: IntegrationWarning[],
): OcadObjectChange[] {
  const changes: OcadObjectChange[] = [];
  for (const warning of warnings) {
    for (const obj of warning.objects) {
      const centroid = resolveObjectCentroid(obj);
      const bbox = resolveObjectBbox(obj);
      if (!centroid || !bbox) continue;
      changes.push({
        changeType: warning.code === "modified_copy_skipped" ? "modified" : "added",
        objectIndex: obj.objectIndex,
        symbolNumber: obj.symbolNumber,
        symbolName: obj.symbolName,
        type: obj.type,
        centroid,
        bbox,
        text: obj.text,
      });
    }
  }
  return changes;
}

export function buildAppendFailedWarning(
  failed: Array<{ checkinObjectIndex: number; reason: string }>,
  changesByIndex: Map<number, OcadObjectChange>,
): IntegrationWarning | null {
  if (failed.length === 0) return null;

  const objects: IntegrationObjectDetail[] = failed.map((item) => {
    const change = changesByIndex.get(item.checkinObjectIndex);
    if (change) return changeToObjectDetail(change);
    return {
      objectIndex: item.checkinObjectIndex,
      symbolNumber: 0,
      symbolName: `Objekt ${item.checkinObjectIndex}`,
      type: "unknown",
      typeLabel: "objekt",
      location: "—",
    };
  });

  return {
    code: "added_not_integrated",
    title:
      failed.length === 1
        ? "1 nytt objekt kunde inte läggas till i aktuella versionen"
        : `${failed.length} nya objekt kunde inte läggas till i aktuella versionen`,
    reason:
      "Följande objekt kunde inte kopieras in automatiskt. " +
      failed.map((item) => item.reason).join(" "),
    objects,
  };
}

export function buildAddedNotIntegratedWarning(
  addedChanges: OcadObjectChange[],
): IntegrationWarning | null {
  if (addedChanges.length === 0) return null;

  return {
    code: "added_not_integrated",
    title:
      addedChanges.length === 1
        ? "1 nytt objekt kunde inte läggas till automatiskt"
        : `${addedChanges.length} nya objekt kunde inte läggas till automatiskt`,
    reason:
      "Dessa objekt kunde inte kopieras in automatiskt vid integration (äldre integration utan objekt-append). " +
      "Kopiera objekten manuellt från checkin-filen till aktuell version i OCAD Desktop (eller rita om dem).",
    objects: addedChanges.map(changeToObjectDetail),
  };
}

export type SkippedCopyDetail = {
  objectIndex: number;
  reason: string;
};

export function buildModifiedCopySkippedWarning(
  skippedItems: SkippedCopyDetail[],
  changesByIndex: Map<number, OcadObjectChange>,
): IntegrationWarning | null {
  if (skippedItems.length === 0) return null;

  const objects: IntegrationObjectDetail[] = [];
  for (const item of skippedItems) {
    const change = changesByIndex.get(item.objectIndex);
    if (change) {
      objects.push(changeToObjectDetail(change));
    } else {
      objects.push({
        objectIndex: item.objectIndex,
        symbolNumber: 0,
        symbolName: `Objekt ${item.objectIndex}`,
        type: "unknown",
        typeLabel: "objekt",
        location: "—",
      });
    }
  }

  const reasonParts = new Set(skippedItems.map((item) => item.reason));

  return {
    code: "modified_copy_skipped",
    title:
      skippedItems.length === 1
        ? "1 ändrat objekt kunde inte kopieras automatiskt"
        : `${skippedItems.length} ändrade objekt kunde inte kopieras automatiskt`,
    reason: [...reasonParts].join(" "),
    objects,
  };
}

export function buildOutOfScopeWarnings(messages: string[]): IntegrationWarning[] {
  return messages.map((message) => ({
    code: "out_of_scope" as const,
    title: "Ändring utanför utcheckningsurval",
    reason: message,
    objects: [],
  }));
}

/** Flatten warnings to strings for audit logs and legacy consumers. */
export function integrationWarningsToStrings(warnings: IntegrationWarning[]): string[] {
  const lines: string[] = [];
  for (const warning of warnings) {
    lines.push(`${warning.title}. ${warning.reason}`);
    for (const obj of warning.objects) {
      const textPart = obj.text ? `, text «${obj.text}»` : "";
      lines.push(
        `  • ${obj.symbolNumber} ${obj.symbolName} (${obj.typeLabel}) vid ${obj.location}, index ${obj.objectIndex}${textPart}`,
      );
    }
  }
  return lines;
}

export function parseIntegrationWarningsFromDiffJson(raw: unknown): IntegrationWarning[] {
  if (!raw) return [];

  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }

  if (!parsed || typeof parsed !== "object") return [];
  const record = parsed as Record<string, unknown>;
  const warnings = record.integrationWarnings;
  if (!Array.isArray(warnings)) return [];

  return warnings.filter(
    (w): w is IntegrationWarning =>
      !!w &&
      typeof w === "object" &&
      typeof (w as IntegrationWarning).title === "string" &&
      typeof (w as IntegrationWarning).reason === "string" &&
      Array.isArray((w as IntegrationWarning).objects),
  );
}

/** True when checkout was integrated with stored warnings metadata (incl. empty = success). */
export function hasIntegrationResultStored(raw: unknown): boolean {
  if (!raw) return false;

  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return false;
    }
  }

  if (!parsed || typeof parsed !== "object") return false;
  const record = parsed as Record<string, unknown>;
  return "integratedVersionNumber" in record || "integrationWarnings" in record;
}
