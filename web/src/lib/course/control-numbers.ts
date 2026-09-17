import type { CoursePointGeometry, EditorObject } from "./types";
import { CourseObjectType } from "./types";
import {
  defaultControlNumberGeoPoint,
  IOF_CONTROL_NUMBER_SIZE,
  IOF_CONTROL_RADIUS,
  isControlSymbol,
} from "./symbols";
import {
  assignMissingControlCodes,
  buildMapLabelMap,
  resolveSequence,
} from "./sequence";

function isPointGeometry(
  geometry: EditorObject["geometry"],
): geometry is CoursePointGeometry {
  return geometry.type === "Point";
}

/** Controls (703) in placement order. */
export function getControlsSorted(objects: EditorObject[]): EditorObject[] {
  return objects
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((o) => isControlSymbol(o.symbolNr));
}

/** 1-based placement index for a 703 object. */
export function controlIndexFor(objects: EditorObject[], controlClientId: string): number {
  const controls = getControlsSorted(objects);
  const idx = controls.findIndex((c) => c.clientId === controlClientId);
  return idx >= 0 ? idx + 1 : 0;
}

function isControlNumberCandidate(
  obj: EditorObject,
  claimed: Set<string> | null,
): obj is EditorObject & { geometry: CoursePointGeometry } {
  if (obj.symbolNr !== 704 || !isPointGeometry(obj.geometry)) return false;
  if (claimed?.has(obj.clientId)) return false;
  return true;
}

export function findControlNumberObject(
  objects: EditorObject[],
  controlClientId: string,
  claimed: Set<string> | null = null,
): EditorObject | undefined {
  const byId = objects.find(
    (o) =>
      isControlNumberCandidate(o, claimed) &&
      o.geometry.linkedControlId === controlClientId,
  );
  if (byId) return byId;
  const index = controlIndexFor(objects, controlClientId);
  if (index > 0) {
    const byIndex = objects.find(
      (o) =>
        isControlNumberCandidate(o, claimed) &&
        o.geometry.linkedControlIndex === index,
    );
    if (byIndex) return byIndex;
  }

  const control = objects.find((o) => o.clientId === controlClientId);
  if (!control || control.geometry.type !== "Point") return undefined;
  const [cx, cy] = control.geometry.coordinates;
  const maxDist = IOF_CONTROL_RADIUS * 5;
  let best: EditorObject | undefined;
  let bestDist = maxDist;
  for (const obj of objects) {
    if (!isControlNumberCandidate(obj, claimed)) continue;
    const [x, y] = obj.geometry.coordinates;
    const dist = Math.hypot(x - cx, y - cy);
    if (dist < bestDist) {
      bestDist = dist;
      best = obj;
    }
  }
  return best;
}

export function findControlForNumberObject(
  objects: EditorObject[],
  numberClientId: string,
): EditorObject | undefined {
  const numberObj = objects.find((o) => o.clientId === numberClientId);
  if (!numberObj || numberObj.symbolNr !== 704 || !isPointGeometry(numberObj.geometry)) {
    return undefined;
  }
  const linkedId = numberObj.geometry.linkedControlId;
  if (linkedId) {
    const byId = objects.find((o) => o.clientId === linkedId && isControlSymbol(o.symbolNr));
    if (byId) return byId;
  }
  const index = numberObj.geometry.linkedControlIndex;
  if (index) {
    const byIndex = getControlsSorted(objects)[index - 1];
    if (byIndex) return byIndex;
  }
  const [nx, ny] = numberObj.geometry.coordinates;
  const maxDist = IOF_CONTROL_RADIUS * 5;
  let best: EditorObject | undefined;
  let bestDist = maxDist;
  for (const control of getControlsSorted(objects)) {
    if (control.geometry.type !== "Point") continue;
    const [cx, cy] = control.geometry.coordinates;
    const dist = Math.hypot(cx - nx, cy - ny);
    if (dist < bestDist) {
      bestDist = dist;
      best = control;
    }
  }
  return best;
}

/**
 * Keep the chosen 704 for its control and drop stacked/stale duplicates
 * so moving a number does not leave another copy underneath.
 */
export function claimControlNumberAndPrune(
  objects: EditorObject[],
  numberClientId: string,
  sequence: string[] = [],
): EditorObject[] {
  const numberObj = objects.find((o) => o.clientId === numberClientId);
  if (!numberObj || numberObj.symbolNr !== 704 || !isPointGeometry(numberObj.geometry)) {
    return objects;
  }
  const control = findControlForNumberObject(objects, numberClientId);
  if (!control) {
    const [kx, ky] = numberObj.geometry.coordinates;
    const stacked = objects.filter((o) => {
      if (o.clientId === numberClientId || o.symbolNr !== 704 || !isPointGeometry(o.geometry)) {
        return false;
      }
      const [x, y] = o.geometry.coordinates;
      return Math.hypot(x - kx, y - ky) < IOF_CONTROL_NUMBER_SIZE;
    });
    if (stacked.length === 0) return objects;
    const drop = new Set(stacked.map((o) => o.clientId));
    return objects.filter((o) => !drop.has(o.clientId));
  }
  const index = controlIndexFor(objects, control.clientId);
  const next = objects.map((o) => {
    if (o.symbolNr !== 704 || !isPointGeometry(o.geometry)) return o;
    if (o.clientId === numberClientId) {
      return {
        ...o,
        geometry: {
          ...o.geometry,
          linkedControlIndex: index,
          linkedControlId: control.clientId,
        },
      };
    }
    if (
      o.geometry.linkedControlId === control.clientId ||
      o.geometry.linkedControlIndex === index
    ) {
      return {
        ...o,
        geometry: {
          ...o.geometry,
          linkedControlIndex: 0,
          linkedControlId: undefined,
        },
      };
    }
    return o;
  });
  return ensureControlNumbers(next, sequence);
}

function newClientId(): string {
  return `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Ensure every 703 has a linked 704; labels follow course sequence. Drop leftover 704s. */
export function ensureControlNumbers(
  objects: EditorObject[],
  sequence: string[] = [],
): EditorObject[] {
  const controls = getControlsSorted(objects);
  const labels = buildMapLabelMap(objects, sequence);
  const next = objects.slice();
  const claimed = new Set<string>();
  let changed = false;

  controls.forEach((control, i) => {
    const index = i + 1;
    const label = labels.get(control.clientId) ?? control.textContent ?? String(index);
    let numberObj = findControlNumberObject(next, control.clientId, claimed);

    if (!numberObj) {
      if (control.geometry.type !== "Point") return;
      const numCoords = defaultControlNumberGeoPoint(control.geometry.coordinates);
      numberObj = {
        clientId: newClientId(),
        id: "",
        symbolNr: 704,
        objectType: CourseObjectType.TEXT,
        geometry: {
          type: "Point",
          coordinates: numCoords,
          linkedControlIndex: index,
          linkedControlId: control.clientId,
        },
        textContent: label,
        sortOrder: next.length,
      };
      next.push(numberObj);
      claimed.add(numberObj.clientId);
      changed = true;
      return;
    }

    claimed.add(numberObj.clientId);
    const geo = numberObj.geometry as CoursePointGeometry;
    if (
      geo.linkedControlIndex !== index ||
      geo.linkedControlId !== control.clientId ||
      numberObj.textContent !== label
    ) {
      const idx = next.findIndex((o) => o.clientId === numberObj!.clientId);
      if (idx >= 0) {
        next[idx] = {
          ...numberObj,
          geometry: { ...geo, linkedControlIndex: index, linkedControlId: control.clientId },
          textContent: label,
        };
        changed = true;
      }
    }
  });

  const pruned = next.filter(
    (obj) => obj.symbolNr !== 704 || claimed.has(obj.clientId),
  );
  if (pruned.length !== next.length) changed = true;
  return changed ? pruned : objects;
}

/** Reassign linkedControlIndex on all 704 objects after control add/delete. */
export function resyncControlNumberIndices(
  objects: EditorObject[],
  sequence: string[] = [],
): EditorObject[] {
  return ensureControlNumbers(objects, sequence);
}

export function isControlNumberObject(obj: EditorObject): boolean {
  return obj.symbolNr === 704;
}

/** Hit tolerance multiplier for 704 text (easier to grab than the circle). */
export function controlNumberHitTolerance(baseTolerance: number): number {
  return Math.max(baseTolerance * 2, IOF_CONTROL_NUMBER_SIZE * 0.6);
}

export function defaultControlNumberForControl(
  controlCoords: [number, number],
  label: string,
  controlIndex: number,
  controlClientId?: string,
): Omit<EditorObject, "sortOrder"> {
  return {
    clientId: newClientId(),
    id: "",
    symbolNr: 704,
    objectType: CourseObjectType.TEXT,
    geometry: {
      type: "Point",
      coordinates: defaultControlNumberGeoPoint(controlCoords),
      linkedControlIndex: controlIndex,
      ...(controlClientId ? { linkedControlId: controlClientId } : {}),
    },
    textContent: label,
  };
}

/** Legacy courses may have numbers drawn on 703 — detect unlinked 704 near control. */
export function migrateLegacyControlNumbers(
  objects: EditorObject[],
  sequence: string[] = [],
): EditorObject[] {
  return ensureControlNumbers(objects, sequence);
}

export function hydrateCourseEditor(
  objects: EditorObject[],
  storedSequence: string[] | null,
): { objects: EditorObject[]; sequence: string[] } {
  const withCodes = assignMissingControlCodes(objects);
  const sequence = resolveSequence(withCodes, storedSequence);
  return {
    objects: ensureControlNumbers(withCodes, sequence),
    sequence,
  };
}
