/**
 * Field-edit preview extent: selection viewBox mapping.
 * Run: npx tsx scripts/test-field-edit-preview-extent.mts
 */
import assert from "node:assert/strict";
import { CheckoutSelectionType } from "../src/lib/checkout/types.ts";
import {
  applySelectionViewBoxToPreviewSvg,
  previewRootTransformFromObjectBounds,
  selectionToPreviewSvgBounds,
  svgBoundsToViewBox,
} from "../src/lib/field-edit/preview-extent.ts";

const objectBounds = { minX: 0, minY: 0, maxX: 10000, maxY: 8000 };
const transform = previewRootTransformFromObjectBounds(objectBounds);
assert.equal(transform.ty, 8000);
assert.equal(transform.flipY, true);

const selection = {
  type: CheckoutSelectionType.POLYGON,
  ring: [
    [1000, 1000],
    [3000, 1000],
    [3000, 2500],
    [1000, 2500],
  ] as [number, number][],
};

const bounds = selectionToPreviewSvgBounds(selection, transform, 0);
// With flipY: svgY = ty - geoY → minY = 8000-2500=5500, maxY = 8000-1000=7000
assert.equal(bounds.minX, 1000);
assert.equal(bounds.maxX, 3000);
assert.equal(bounds.minY, 5500);
assert.equal(bounds.maxY, 7000);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10000 8000" width="100%" height="100%">
<g transform="translate(0, 8000)"><path d="M0 0"/></g>
</svg>`;

const clipped = applySelectionViewBoxToPreviewSvg(svg, selection, 0);
assert.match(clipped, /viewBox="1000 5500 2000 1500"/);
assert.ok(!clipped.includes('viewBox="0 0 10000 8000"'));

const padded = selectionToPreviewSvgBounds(selection, transform, 0.05);
assert.ok(padded.minX < bounds.minX);
assert.ok(padded.maxX > bounds.maxX);
assert.equal(svgBoundsToViewBox(bounds), "1000 5500 2000 1500");

console.log("test-field-edit-preview-extent: ok");
