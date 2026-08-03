import type { OcadObjectChange } from "@/lib/ocad/diff-types";
import type { OcadObjectType } from "@/lib/ocad/types";

export type IntegrationObjectDetail = {
  objectIndex: number;
  symbolNumber: number;
  symbolName: string;
  type: OcadObjectType;
  typeLabel: string;
  location: string;
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
    text: change.text,
  };
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
      "Systemet kan uppdatera och ta bort befintliga objekt i aktuella versionen, men saknar stöd för att skapa helt nya OCAD-objekt. " +
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
    title: "Ändring utanför checkout-urval",
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
