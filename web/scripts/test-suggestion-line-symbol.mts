import { validateSuggestionGeometry } from "../src/lib/suggestion/access";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const line = validateSuggestionGeometry({
  type: "LineString",
  coordinates: [
    [0, 0],
    [10, 10],
  ],
  symbolNum: 601.2,
});

assert(line?.type === "LineString", "parses line");
assert(line?.type === "LineString" && line.symbolNum === 601, "rounds symbol num");

const invalid = validateSuggestionGeometry({
  type: "LineString",
  coordinates: [
    [0, 0],
    [10, 10],
  ],
  symbolNum: -1,
});
assert(invalid === null, "rejects invalid symbol");

console.log("suggestion-line-symbol: ok");
