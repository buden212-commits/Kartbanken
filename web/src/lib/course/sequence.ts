import type { CourseObjectDto, EditorObject } from "./types";
import { CourseObjectType } from "./types";
import { COURSE_LEG_SYMBOLS } from "./symbols";

export const FIRST_CONTROL_CODE = 31;

export type CoursePoint = CourseObjectDto | EditorObject;

export type AppendVisitResult = { ok: true } | { ok: false; reason: string };

export type CourseVisit = {
  sequenceIndex: number;
  clientId: string;
  symbolNr: number;
  /** 1-based control visit number; null for start/finish. */
  visitNumber: number | null;
  code: number | null;
};

function objectRef(obj: CoursePoint): string {
  return "clientId" in obj && obj.clientId ? obj.clientId : obj.id;
}

export function isCourseNetworkPoint(obj: CoursePoint): boolean {
  return (
    obj.objectType === CourseObjectType.POINT &&
    obj.geometry.type === "Point" &&
    COURSE_LEG_SYMBOLS.has(obj.symbolNr)
  );
}

export function lookupObject(
  objects: CoursePoint[],
  ref: string,
): CoursePoint | undefined {
  return objects.find((o) => objectRef(o) === ref);
}

export function parseControlCode(obj: CoursePoint): number | null {
  if (obj.symbolNr !== 703) return null;
  const raw = obj.textContent?.trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < FIRST_CONTROL_CODE) return null;
  return n;
}

export function nextControlCode(objects: CoursePoint[]): number {
  const used = new Set<number>();
  for (const obj of objects) {
    const code = parseControlCode(obj);
    if (code != null) used.add(code);
  }
  let n = FIRST_CONTROL_CODE;
  while (used.has(n)) n += 1;
  return n;
}

export function assignMissingControlCodes<T extends CoursePoint>(objects: T[]): T[] {
  const used = new Set<number>();
  for (const obj of objects) {
    const code = parseControlCode(obj);
    if (code != null) used.add(code);
  }
  let n = FIRST_CONTROL_CODE;
  const takeNext = () => {
    while (used.has(n)) n += 1;
    const code = n;
    used.add(code);
    n += 1;
    return code;
  };

  let changed = false;
  const next = objects.map((obj) => {
    if (obj.symbolNr !== 703) return obj;
    if (parseControlCode(obj) != null) return obj;
    changed = true;
    return { ...obj, textContent: String(takeNext()) };
  });
  return changed ? next : objects;
}

export function parseSequenceJson(raw: string | null | undefined): string[] | null {
  if (raw == null || raw === "") return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return null;
  }
}

/** All start/control/finish points in placement order. */
export function networkPoints(objects: CoursePoint[]): CoursePoint[] {
  return objects
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter(isCourseNetworkPoint);
}

/**
 * `stored === null` means a legacy course: infer sequence from all network points.
 * An explicit array (including empty) is filtered to existing network points.
 */
export function resolveSequence(objects: CoursePoint[], stored: string[] | null): string[] {
  if (stored == null) {
    return networkPoints(objects).map(objectRef);
  }
  return stored.filter((id) => {
    const obj = lookupObject(objects, id);
    return obj != null && isCourseNetworkPoint(obj);
  });
}

export function pointsAlongSequence(
  objects: CoursePoint[],
  sequence: string[],
): CoursePoint[] {
  const points: CoursePoint[] = [];
  for (const id of sequence) {
    const obj = lookupObject(objects, id);
    if (obj && isCourseNetworkPoint(obj)) points.push(obj);
  }
  return points;
}

export function buildCourseVisits(
  objects: CoursePoint[],
  sequence: string[],
): CourseVisit[] {
  const visits: CourseVisit[] = [];
  let visitNumber = 0;
  sequence.forEach((id, sequenceIndex) => {
    const obj = lookupObject(objects, id);
    if (!obj || !isCourseNetworkPoint(obj)) return;
    const isControl = obj.symbolNr === 703;
    if (isControl) visitNumber += 1;
    visits.push({
      sequenceIndex,
      clientId: id,
      symbolNr: obj.symbolNr,
      visitNumber: isControl ? visitNumber : null,
      code: parseControlCode(obj),
    });
  });
  return visits;
}

/** Map labels at each control circle: "1", "2/7", or unused code "31". */
export function buildMapLabelMap(
  objects: CoursePoint[],
  sequence: string[],
): Map<string, string> {
  const visitsByControl = new Map<string, number[]>();
  for (const visit of buildCourseVisits(objects, sequence)) {
    if (visit.visitNumber == null) continue;
    const list = visitsByControl.get(visit.clientId) ?? [];
    list.push(visit.visitNumber);
    visitsByControl.set(visit.clientId, list);
  }

  const labels = new Map<string, string>();
  for (const obj of objects) {
    if (obj.symbolNr !== 703) continue;
    const id = objectRef(obj);
    const visits = visitsByControl.get(id);
    if (visits && visits.length > 0) {
      labels.set(id, visits.join("/"));
      continue;
    }
    const code = parseControlCode(obj);
    if (code != null) labels.set(id, String(code));
  }
  return labels;
}

export function unusedControls<T extends CoursePoint>(
  objects: T[],
  sequence: string[],
): T[] {
  const used = new Set(sequence);
  return objects
    .slice()
    .sort((a, b) => {
      const ca = parseControlCode(a) ?? 0;
      const cb = parseControlCode(b) ?? 0;
      if (ca !== cb) return ca - cb;
      return a.sortOrder - b.sortOrder;
    })
    .filter((o) => o.symbolNr === 703 && !used.has(objectRef(o)));
}

/** Drop unused start/controls/finish (and their 704 labels) from a printed course. */
export function objectsForPrintedCourse<T extends CoursePoint>(
  objects: T[],
  sequence: string[],
): T[] {
  const used = new Set(sequence);
  const controls = objects
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((o) => o.symbolNr === 703);
  const usedIndices = new Set<number>();
  controls.forEach((control, i) => {
    if (used.has(objectRef(control))) usedIndices.add(i + 1);
  });

  return objects.filter((obj) => {
    if (COURSE_LEG_SYMBOLS.has(obj.symbolNr)) {
      return used.has(objectRef(obj));
    }
    if (obj.symbolNr === 704 && obj.geometry.type === "Point") {
      const index = obj.geometry.linkedControlIndex;
      return index != null && usedIndices.has(index);
    }
    return true;
  });
}

export function lastSequenceObject(
  objects: CoursePoint[],
  sequence: string[],
): CoursePoint | undefined {
  if (sequence.length === 0) return undefined;
  return lookupObject(objects, sequence[sequence.length - 1]!);
}

export function canAppendVisit(
  objects: CoursePoint[],
  sequence: string[],
  hit: CoursePoint,
): AppendVisitResult {
  if (!isCourseNetworkPoint(hit)) {
    return { ok: false, reason: "Klicka på en utlagd start, kontroll eller mål." };
  }

  if (sequence.length === 0) {
    if (hit.symbolNr !== 701) {
      return { ok: false, reason: "Börja med att klicka på starten." };
    }
    return { ok: true };
  }

  const last = lastSequenceObject(objects, sequence);
  if (last?.symbolNr === 706) {
    return {
      ok: false,
      reason: "Banan är avslutad (mål). Ångra sista för att ändra.",
    };
  }

  if (hit.symbolNr === 701) {
    return { ok: false, reason: "Starten är redan i banan." };
  }

  if (hit.symbolNr !== 703 && hit.symbolNr !== 706) {
    return { ok: false, reason: "Klicka på en kontroll eller mål." };
  }

  return { ok: true };
}

export function appendVisit(sequence: string[], hitId: string): string[] {
  return [...sequence, hitId];
}

export function undoLastVisit(sequence: string[]): string[] {
  if (sequence.length === 0) return sequence;
  return sequence.slice(0, -1);
}

/** Remove one visit. Removing the start (index 0) clears the whole sequence. */
export function removeVisitAt(sequence: string[], index: number): string[] {
  if (index < 0 || index >= sequence.length) return sequence;
  if (index === 0) return [];
  return sequence.filter((_, i) => i !== index);
}

export function removeObjectFromSequence(sequence: string[], objectId: string): string[] {
  if (sequence[0] === objectId) return [];
  return sequence.filter((id) => id !== objectId);
}

export function courseHint(sequence: string[], objects: CoursePoint[]): string {
  if (sequence.length === 0) {
    const hasStart = objects.some((o) => o.symbolNr === 701);
    return hasStart
      ? "Klicka på starten för att börja banan."
      : "Lägg ut start och kontroller först. Välj sedan Rita bana.";
  }
  const last = lastSequenceObject(objects, sequence);
  if (last?.symbolNr === 706) {
    return "Banan är avslutad. Ångra sista om du vill ändra.";
  }
  return "Klicka på kontroller i den ordning de ska springas. Avsluta med mål.";
}

export function validateSequenceIndices(
  objects: Array<{ symbolNr: number }>,
  indices: unknown,
): { ok: true; indices: number[] | null } | { ok: false; error: string } {
  if (indices === undefined) {
    return { ok: true, indices: null };
  }
  if (!Array.isArray(indices)) {
    return { ok: false, error: "sequence måste vara en array av index" };
  }
  const parsed: number[] = [];
  for (let i = 0; i < indices.length; i++) {
    const n = indices[i];
    if (!Number.isInteger(n) || (n as number) < 0 || (n as number) >= objects.length) {
      return { ok: false, error: `sequence[${i}] är ogiltigt` };
    }
    const obj = objects[n as number]!;
    if (!COURSE_LEG_SYMBOLS.has(obj.symbolNr)) {
      return {
        ok: false,
        error: `sequence[${i}] måste peka på start, kontroll eller mål`,
      };
    }
    parsed.push(n as number);
  }
  return { ok: true, indices: parsed };
}
