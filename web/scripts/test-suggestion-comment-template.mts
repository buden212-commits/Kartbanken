import assert from "node:assert/strict";
import type { OcadMapLayer } from "@/lib/ocad/layers";
import {
  buildSuggestionCommentTemplate,
  extractOcadSymbolPicks,
  flattenSymbolLabels,
  findActiveMarkingIndex,
  findMarkingLineEnd,
  findMarkingLineStart,
  groupOcadSymbolPicks,
  insertTextAtCursor,
  markingGeometryKind,
  symbolDescriptionOnly,
  suggestionMarkingGeometryLabel,
} from "@/lib/suggestion/suggestion-comment-template";
import type { SuggestionGeometry } from "@/lib/suggestion/types";

const markings: SuggestionGeometry[] = [
  { type: "Point", coordinates: [0, 0] },
  { type: "LineString", coordinates: [[0, 0], [1, 1]] },
  { type: "Polygon", ring: [[0, 0], [1, 0], [1, 1], [0, 0]] },
];

assert.equal(suggestionMarkingGeometryLabel(markings[0]!), "Punkt");
assert.equal(suggestionMarkingGeometryLabel(markings[1]!), "Linje");
assert.equal(suggestionMarkingGeometryLabel(markings[2]!), "Yta");

const template = buildSuggestionCommentTemplate(markings);
assert.equal(template, "1. Punkt — \n2. Linje — \n3. Yta — ");

const text = "1. Punkt — sten\n2. Linje — stig";
assert.equal(findMarkingLineStart(text, 1), text.indexOf("2."));
assert.equal(findMarkingLineEnd(text, 0), text.indexOf("\n"));
assert.equal(findActiveMarkingIndex(text, text.indexOf("stig"), 2), 1);

const line0End = findMarkingLineEnd(template, 0);
const inserted = insertTextAtCursor(template, "Punkthöjd", line0End, line0End);
assert.equal(inserted.next.startsWith("1. Punkt — Punkthöjd"), true);
assert.equal(inserted.next.includes("Punkthöjd1."), false);

assert.equal(symbolDescriptionOnly("601.002 Sten"), "Sten");
assert.equal(symbolDescriptionOnly("Sten"), "Sten");

const layers: OcadMapLayer[] = [
  {
    id: "g1",
    groupId: 1,
    kind: "group",
    name: "Sten",
    visible: true,
    locked: false,
    objectCount: 5,
    children: [
      {
        id: "g1-s100",
        groupId: 1,
        kind: "symbol",
        name: "601.002 Sten",
        visible: true,
        locked: false,
        objectCount: 5,
        symbolNum: 601002,
        symbolType: 1,
      },
      {
        id: "g1-s101",
        groupId: 1,
        kind: "symbol",
        name: "601.003 Sten",
        visible: true,
        locked: false,
        objectCount: 2,
        symbolNum: 601003,
        symbolType: 1,
      },
    ],
  },
  {
    id: "g2",
    groupId: 2,
    kind: "group",
    name: "Stig",
    visible: true,
    locked: false,
    objectCount: 3,
    children: [
      {
        id: "g2-s200",
        groupId: 2,
        kind: "symbol",
        name: "504.001 Stig",
        visible: true,
        locked: false,
        objectCount: 3,
        symbolNum: 504001,
        symbolType: 2,
      },
    ],
  },
];

const picks = extractOcadSymbolPicks(layers);
assert.equal(picks.length, 3);
assert.equal(picks[0]!.label, "Sten");
assert.equal(picks[0]!.objectCount, 5);
assert.equal(picks[0]!.groupName, "Sten");

const pointGroups = groupOcadSymbolPicks(picks, { geometryKind: "point" });
assert.equal(pointGroups.length, 1);
assert.equal(pointGroups[0]!.groupName, "Sten");
assert.deepEqual(pointGroups[0]!.symbols.map((s) => s.label), ["Sten"]);
assert.equal(pointGroups[0]!.symbols[0]!.objectCount, 7);
assert.equal(pointGroups[0]!.objectCount, 7);

const lineGroups = groupOcadSymbolPicks(picks, { geometryKind: "line" });
assert.equal(lineGroups.length, 1);
assert.equal(lineGroups[0]!.symbols[0]!.label, "Stig");

const allGroups = groupOcadSymbolPicks(picks);
assert.deepEqual(
  allGroups.map((g) => g.groupName),
  ["Sten", "Stig"],
);
assert.deepEqual(
  flattenSymbolLabels(allGroups),
  ["Sten", "Stig"],
);

assert.equal(markingGeometryKind(markings[0]!), "point");
assert.equal(markingGeometryKind(markings[1]!), "line");
assert.equal(markingGeometryKind(markings[2]!), "area");

console.log("suggestion-comment-template: ok");
