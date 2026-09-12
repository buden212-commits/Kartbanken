import type { FieldEditAdd, FieldEditGeometryKind } from "@/lib/field-edit/types";
import { closedRing } from "@/lib/field-edit/vertices";
import type { OcadObjectType } from "@/lib/ocad/types";

export type FillBorderActionKind =
  | "duplicateIdentical"
  | "duplicateWithSymbol"
  | "makeBorder"
  | "fillArea"
  | "bboxBorder"
  | "bboxFill"
  | "fillHoles"
  | "borderHoles";

export type FillBorderPlan = {
  action: FillBorderActionKind;
  label: string;
  adds: FieldEditAdd[];
};

export type FillBorderInput = {
  objectType: OcadObjectType;
  objectSymbol: number;
  coordinates: [number, number][];
  holes?: [number, number][][];
  bbox: [number, number, number, number];
  targetSymbol: number;
  targetKind: FieldEditGeometryKind;
  /** Map units used to expand degenerate point/text bboxes. */
  bboxPadMapUnits: number;
  /**
   * When true and the area has holes: fill holes (area symbol) or
   * create borders around holes (line symbol) instead of operating on the outer object.
   */
  useHoles?: boolean;
};

export function findSymbolKind(
  groups: Record<FieldEditGeometryKind, { symNum: number }[]>,
  symNum: number,
): FieldEditGeometryKind | null {
  for (const kind of ["point", "line", "area"] as const) {
    if (groups[kind].some((c) => c.symNum === symNum)) return kind;
  }
  return null;
}

function cloneCoords(coords: [number, number][]): [number, number][] {
  return coords.map(([x, y]) => [x, y] as [number, number]);
}

function bboxToRing(
  bbox: [number, number, number, number],
  pad: number,
): [number, number][] {
  let [minX, minY, maxX, maxY] = bbox;
  if (!(maxX > minX)) {
    minX -= pad;
    maxX += pad;
  }
  if (!(maxY > minY)) {
    minY -= pad;
    maxY += pad;
  }
  return [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
    [minX, minY],
  ];
}

function objectKind(type: OcadObjectType): FieldEditGeometryKind | null {
  if (type === "line") return "line";
  if (type === "area") return "area";
  if (type === "point" || type === "text") return "point";
  return null;
}

function holeLineAdds(
  holes: [number, number][][],
  symbolNumber: number,
): FieldEditAdd[] {
  const adds: FieldEditAdd[] = [];
  for (const hole of holes) {
    const ring = closedRing(hole);
    if (ring.length < 4) continue;
    adds.push({ kind: "line", coordinates: ring, symbolNumber });
  }
  return adds;
}

function holeAreaAdds(
  holes: [number, number][][],
  symbolNumber: number,
): FieldEditAdd[] {
  const adds: FieldEditAdd[] = [];
  for (const hole of holes) {
    const ring = closedRing(hole);
    if (ring.length < 4) continue;
    adds.push({ kind: "area", ring, symbolNumber });
  }
  return adds;
}

/**
 * Plan OCAD "Fill or Make Border or Duplicate Identically" for the
 * selected object and the symbol chosen in the symbol box.
 */
export function planFillOrBorderOrDuplicate(
  input: FillBorderInput,
): FillBorderPlan | { error: string } {
  const {
    objectType,
    objectSymbol,
    coordinates,
    holes = [],
    bbox,
    targetSymbol,
    targetKind,
    bboxPadMapUnits,
    useHoles = false,
  } = input;

  const srcKind = objectKind(objectType);
  if (!srcKind) {
    return { error: "Objekttypen stöds inte för fyll/kant/duplicera." };
  }

  // Hole mode (OCAD: hole selected + area/line symbol).
  if (useHoles) {
    if (objectType !== "area") {
      return { error: "Hål finns bara på ytor." };
    }
    if (holes.length === 0) {
      return { error: "Ytan har inga hål." };
    }
    if (targetKind === "area") {
      const adds = holeAreaAdds(holes, targetSymbol);
      if (adds.length === 0) return { error: "Inga giltiga hål att fylla." };
      return {
        action: "fillHoles",
        label: `Fyll ${adds.length} hål med ytsymbol`,
        adds,
      };
    }
    if (targetKind === "line") {
      const adds = holeLineAdds(holes, targetSymbol);
      if (adds.length === 0) return { error: "Inga giltiga hål för kantlinje." };
      return {
        action: "borderHoles",
        label: `Skapa kantlinje runt ${adds.length} hål`,
        adds,
      };
    }
    return { error: "För hål: välj ytsymbol (fyll) eller linjesymbol (kant)." };
  }

  // Same geometry kind → duplicate (identical or with new symbol).
  if (srcKind === targetKind) {
    if (objectType === "point" || objectType === "text") {
      const pt = coordinates[0];
      if (!pt) return { error: "Punkten saknar koordinater." };
      const identical = objectSymbol === targetSymbol;
      return {
        action: identical ? "duplicateIdentical" : "duplicateWithSymbol",
        label: identical
          ? "Duplicera identiskt (samma position och symbol)"
          : "Kopiera punkt med vald symbol",
        adds: [
          {
            kind: "point",
            x: pt[0],
            y: pt[1],
            symbolNumber: targetSymbol,
          },
        ],
      };
    }

    if (objectType === "line") {
      if (coordinates.length < 2) {
        return { error: "Linjen behöver minst två punkter." };
      }
      const identical = objectSymbol === targetSymbol;
      return {
        action: identical ? "duplicateIdentical" : "duplicateWithSymbol",
        label: identical
          ? "Duplicera identiskt (samma position och symbol)"
          : "Kopiera linje med vald symbol",
        adds: [
          {
            kind: "line",
            coordinates: cloneCoords(coordinates),
            symbolNumber: targetSymbol,
          },
        ],
      };
    }

    const ring = closedRing(coordinates);
    if (ring.length < 4) {
      return { error: "Ytan behöver minst tre hörn." };
    }
    const identical = objectSymbol === targetSymbol;
    return {
      action: identical ? "duplicateIdentical" : "duplicateWithSymbol",
      label: identical
        ? "Duplicera identiskt (samma position och symbol)"
        : "Kopiera yta med vald symbol",
      adds: [
        {
          kind: "area",
          ring,
          symbolNumber: targetSymbol,
          ...(holes.length > 0 ? { holes: holes.map((h) => closedRing(h)) } : {}),
        },
      ],
    };
  }

  // Area + line symbol → border around outer ring (and each hole as separate lines).
  if (objectType === "area" && targetKind === "line") {
    const ring = closedRing(coordinates);
    if (ring.length < 4) {
      return { error: "Ytan behöver minst tre hörn för kantlinje." };
    }
    const adds: FieldEditAdd[] = [
      { kind: "line", coordinates: ring, symbolNumber: targetSymbol },
      ...holeLineAdds(holes, targetSymbol),
    ];
    return {
      action: "makeBorder",
      label:
        holes.length > 0
          ? `Skapa kantlinje runt ytan och ${holes.length} hål`
          : "Skapa kantlinje runt ytan",
      adds,
    };
  }

  // Line + area symbol → fill (closed line becomes area).
  if (objectType === "line" && targetKind === "area") {
    const ring = closedRing(coordinates);
    if (ring.length < 4) {
      return {
        error: "Linjen måste vara stängd (eller ha ≥3 punkter) för att fyllas.",
      };
    }
    return {
      action: "fillArea",
      label: "Fyll linjen med ytsymbol",
      adds: [{ kind: "area", ring, symbolNumber: targetSymbol }],
    };
  }

  // Point/text + line/area → bounding box border or fill.
  if ((objectType === "point" || objectType === "text") && targetKind === "line") {
    const ring = bboxToRing(bbox, bboxPadMapUnits);
    return {
      action: "bboxBorder",
      label: "Skapa kantlinje runt objektets omslutande rektangel",
      adds: [{ kind: "line", coordinates: ring, symbolNumber: targetSymbol }],
    };
  }

  if ((objectType === "point" || objectType === "text") && targetKind === "area") {
    const ring = bboxToRing(bbox, bboxPadMapUnits);
    return {
      action: "bboxFill",
      label: "Fyll objektets omslutande rektangel med ytsymbol",
      adds: [{ kind: "area", ring, symbolNumber: targetSymbol }],
    };
  }

  return {
    error:
      "Symbolen passar inte objektet. Exempel: yta+linje → kant, linje+yta → fyll, samma typ → kopiera.",
  };
}

/** @deprecated Prefer plan result.adds — kept for tests/helpers */
export function holeBorderAdds(
  holes: [number, number][][],
  symbolNumber: number,
): FieldEditAdd[] {
  return holeLineAdds(holes, symbolNumber);
}

export function holeFillAdds(
  holes: [number, number][][],
  symbolNumber: number,
): FieldEditAdd[] {
  return holeAreaAdds(holes, symbolNumber);
}
