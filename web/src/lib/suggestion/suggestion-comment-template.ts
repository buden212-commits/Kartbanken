import type { OcadMapLayer } from "@/lib/ocad/layers";
import type { SuggestionGeometry } from "@/lib/suggestion/types";
import { isDeletePointGeometry } from "@/lib/suggestion/geometry";

/** Punkt / linje / yta — enhetliga geometribegrepp i beskrivningen. */
export function suggestionMarkingGeometryLabel(geometry: SuggestionGeometry): string {
  if (isDeletePointGeometry(geometry)) return "Punkt (radera)";
  switch (geometry.type) {
    case "Point":
      return "Punkt";
    case "LineString":
      return "Linje";
    case "Bbox":
    case "Polygon":
      return "Yta";
  }
}

export type MarkingGeometryKind = "point" | "line" | "area" | "all";

export function markingGeometryKind(geometry: SuggestionGeometry): MarkingGeometryKind {
  // Radera-markering: användaren pekar ut något att ta bort — visa alla symboltyper.
  if (isDeletePointGeometry(geometry)) return "all";
  if (geometry.type === "Point") return "point";
  if (geometry.type === "LineString") return "line";
  return "area";
}

/** OCAD symbol type: 1 point, 2 line, 3 area, 7 rectangle. `null` = ingen filtrering. */
export function ocadSymbolTypesForKind(kind: MarkingGeometryKind): number[] | null {
  switch (kind) {
    case "all":
      return null;
    case "point":
      return [1];
    case "line":
      return [2];
    case "area":
      return [3, 7];
  }
}

export function symbolDescriptionOnly(symbolName: string): string {
  const trimmed = symbolName.trim();
  const withoutNumber = trimmed.replace(/^\d+(?:\.\d+)?\s*/, "").trim();
  return withoutNumber || trimmed;
}

export type SuggestionSymbolPick = {
  groupName: string;
  label: string;
  symbolType: number;
  /** Antal objekt på kartan med denna symbol. */
  objectCount: number;
};

export type SuggestionSymbolGroup = {
  groupName: string;
  symbols: SuggestionSymbolPick[];
  objectCount: number;
};

function compareByUsageThenLabel(a: SuggestionSymbolPick, b: SuggestionSymbolPick): number {
  if (b.objectCount !== a.objectCount) return b.objectCount - a.objectCount;
  return a.label.localeCompare(b.label, "sv");
}

/** Slår ihop samma etikett och summerar objectCount; sorterar mest använda först. */
export function mergeAndRankSymbolPicks(symbols: SuggestionSymbolPick[]): SuggestionSymbolPick[] {
  const byKey = new Map<string, SuggestionSymbolPick>();
  for (const symbol of symbols) {
    const key = `${symbol.groupName}\0${symbol.label}`.toLowerCase();
    const existing = byKey.get(key);
    if (existing) {
      existing.objectCount += symbol.objectCount;
      continue;
    }
    byKey.set(key, { ...symbol });
  }
  return [...byKey.values()].sort(compareByUsageThenLabel);
}

/** Global ranking över grupper — för snabbvalet. */
export function rankSymbolLabels(symbols: SuggestionSymbolPick[]): string[] {
  const byLabel = new Map<string, SuggestionSymbolPick>();
  for (const symbol of symbols) {
    const key = symbol.label.toLowerCase();
    const existing = byLabel.get(key);
    if (existing) {
      existing.objectCount += symbol.objectCount;
      continue;
    }
    byLabel.set(key, { ...symbol });
  }
  return [...byLabel.values()].sort(compareByUsageThenLabel).map((s) => s.label);
}

export function extractOcadSymbolPicks(layers: OcadMapLayer[]): SuggestionSymbolPick[] {
  const picks: SuggestionSymbolPick[] = [];

  function walk(nodes: OcadMapLayer[], parentGroupName: string | null) {
    for (const node of nodes) {
      if (node.kind === "group") {
        walk(node.children ?? [], node.name.trim() || parentGroupName);
        continue;
      }
      if (node.kind !== "symbol" || node.objectCount === 0 || node.symbolType == null) {
        continue;
      }
      const label = symbolDescriptionOnly(node.name);
      if (!label) continue;
      picks.push({
        groupName: parentGroupName?.trim() || "Övrigt",
        label,
        symbolType: node.symbolType,
        objectCount: node.objectCount,
      });
    }
  }

  walk(layers, null);
  return picks;
}

export function groupOcadSymbolPicks(
  picks: SuggestionSymbolPick[],
  options?: {
    geometryKind?: MarkingGeometryKind;
    query?: string;
  },
): SuggestionSymbolGroup[] {
  const allowedTypesList = options?.geometryKind
    ? ocadSymbolTypesForKind(options.geometryKind)
    : null;
  const allowedTypes = allowedTypesList ? new Set(allowedTypesList) : null;
  const q = options?.query?.trim().toLowerCase() ?? "";

  const filtered = picks.filter((pick) => {
    if (allowedTypes && !allowedTypes.has(pick.symbolType)) return false;
    if (!q) return true;
    return (
      pick.label.toLowerCase().includes(q) ||
      pick.groupName.toLowerCase().includes(q)
    );
  });

  const byGroup = new Map<string, SuggestionSymbolPick[]>();
  for (const pick of filtered) {
    const list = byGroup.get(pick.groupName) ?? [];
    list.push(pick);
    byGroup.set(pick.groupName, list);
  }

  return [...byGroup.entries()]
    .map(([groupName, symbols]) => {
      const ranked = mergeAndRankSymbolPicks(symbols);
      return {
        groupName,
        symbols: ranked,
        objectCount: ranked.reduce((sum, s) => sum + s.objectCount, 0),
      };
    })
    .sort((a, b) => {
      if (b.objectCount !== a.objectCount) return b.objectCount - a.objectCount;
      return a.groupName.localeCompare(b.groupName, "sv");
    });
}

export function flattenSymbolLabels(groups: SuggestionSymbolGroup[]): string[] {
  return rankSymbolLabels(groups.flatMap((group) => group.symbols));
}

export function buildSuggestionCommentTemplate(markings: SuggestionGeometry[]): string {
  if (markings.length === 0) return "";
  return markings
    .map((marking, index) => `${index + 1}. ${suggestionMarkingGeometryLabel(marking)} — `)
    .join("\n");
}

export const SUGGESTION_SYMBOL_QUICK_PICK_COUNT = 8;

export function findMarkingLineStart(text: string, markingIndex: number): number {
  const prefix = `${markingIndex + 1}.`;
  let pos = 0;
  for (const line of text.split("\n")) {
    if (line.startsWith(prefix)) {
      return pos;
    }
    pos += line.length + 1;
  }
  return 0;
}

/** Slutet av markeringens rad (före eventuell radbrytning). */
export function findMarkingLineEnd(text: string, markingIndex: number): number {
  const start = findMarkingLineStart(text, markingIndex);
  const lineEnd = text.indexOf("\n", start);
  return lineEnd === -1 ? text.length : lineEnd;
}

/** Vilken markering (0-baserad) markören står på, utifrån textarea-cursor. */
export function findActiveMarkingIndex(text: string, cursor: number, markingCount: number): number {
  if (markingCount <= 0) return 0;
  let best = 0;
  for (let index = 0; index < markingCount; index++) {
    const start = findMarkingLineStart(text, index);
    if (start <= cursor) {
      best = index;
    }
  }
  return best;
}

export function insertTextAtCursor(
  text: string,
  insertion: string,
  selectionStart: number,
  selectionEnd: number,
): { next: string; cursor: number } {
  const before = text.slice(0, selectionStart);
  const after = text.slice(selectionEnd);
  const next = `${before}${insertion}${after}`;
  const cursor = selectionStart + insertion.length;
  return { next, cursor };
}

function normalizeSpeechText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9åäö\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prevDiag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j]!;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, prevDiag + cost);
      prevDiag = temp;
    }
  }
  return prev[b.length]!;
}

/**
 * Matchar talad text mot OCAD-symbolbeskrivningar.
 * Returnerar bästa label, annars null (anropaaren kan infoga råtranscript).
 */
export function matchSpokenTextToSymbol(
  spoken: string,
  labels: string[],
): string | null {
  const query = normalizeSpeechText(spoken);
  if (!query || labels.length === 0) return null;

  let best: { label: string; score: number } | null = null;

  for (const label of labels) {
    const norm = normalizeSpeechText(label);
    if (!norm) continue;

    let score = 0;
    if (norm === query) {
      score = 1000;
    } else if (norm.startsWith(query) || query.startsWith(norm)) {
      score = 800 - Math.abs(norm.length - query.length);
    } else if (norm.includes(query) || query.includes(norm)) {
      score = 600 - Math.abs(norm.length - query.length);
    } else {
      const dist = levenshteinDistance(norm, query);
      const maxLen = Math.max(norm.length, query.length);
      const similarity = 1 - dist / maxLen;
      if (similarity < 0.72) continue;
      score = Math.round(similarity * 500);
    }

    if (!best || score > best.score) {
      best = { label, score };
    }
  }

  return best && best.score >= 360 ? best.label : null;
}
