import type { CoursePointGeometry, EditorObject } from "./types";
import { CourseObjectType } from "./types";
import {
  defaultControlNumberGeoPoint,
  IOF_CONTROL_NUMBER_SIZE,
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

export function findControlNumberObject(
  objects: EditorObject[],
  controlClientId: string,
): EditorObject | undefined {
  const index = controlIndexFor(objects, controlClientId);
  if (index <= 0) return undefined;
  return objects.find(
    (o) =>
      o.symbolNr === 704 &&
      isPointGeometry(o.geometry) &&
      o.geometry.linkedControlIndex === index,
  );
}

export function findControlForNumberObject(
  objects: EditorObject[],
  numberClientId: string,
): EditorObject | undefined {
  const numberObj = objects.find((o) => o.clientId === numberClientId);
  if (!numberObj || numberObj.symbolNr !== 704 || !isPointGeometry(numberObj.geometry)) {
    return undefined;
  }
  const index = numberObj.geometry.linkedControlIndex;
  if (!index) return undefined;
  const controls = getControlsSorted(objects);
  return controls[index - 1];
}

function newClientId(): string {
  return `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Ensure every 703 has a linked 704; labels follow course sequence. */
export function ensureControlNumbers(
  objects: EditorObject[],
  sequence: string[] = [],
): EditorObject[] {
  const controls = getControlsSorted(objects);
  const labels = buildMapLabelMap(objects, sequence);
  const next = objects.slice();
  let changed = false;

  controls.forEach((control, i) => {
    const index = i + 1;
    const label = labels.get(control.clientId) ?? control.textContent ?? String(index);
    let numberObj = findControlNumberObject(next, control.clientId);

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
        },
        textContent: label,
        sortOrder: next.length,
      };
      next.push(numberObj);
      changed = true;
    } else {
      const geo = numberObj.geometry as CoursePointGeometry;
      if (geo.linkedControlIndex !== index || numberObj.textContent !== label) {
        const idx = next.findIndex((o) => o.clientId === numberObj!.clientId);
        if (idx >= 0) {
          next[idx] = {
            ...numberObj,
            geometry: { ...geo, linkedControlIndex: index },
            textContent: label,
          };
          changed = true;
        }
      }
    }
  });

  return changed ? next : objects;
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
