/**
 * Screen-space overlay sizing: SVG user units per CSS pixel.
 * Run: npx tsx scripts/test-screen-space.mts
 */
import assert from "node:assert/strict";
import { screenPxToSvgUser, svgUnitsPerScreenPx } from "../src/lib/ocad/screen-space.ts";

function approx(a: number, b: number, eps = 1e-9) {
  assert.ok(Math.abs(a - b) < eps, `expected ${a} ≈ ${b}`);
}

// viewBox 100×100 in a 200×200 container, zoom 1 → meet scale 2 → 0.5 units/px
approx(svgUnitsPerScreenPx("0 0 100 100", 200, 200, 1), 0.5);

// Larger extent (same container) → more units per pixel
approx(svgUnitsPerScreenPx("0 0 1000 1000", 200, 200, 1), 5);

// Zoom 2 doubles on-screen size → half units per pixel
approx(svgUnitsPerScreenPx("0 0 100 100", 200, 200, 2), 0.25);

// Handle radius 6 px → 30 map units on large extent
approx(screenPxToSvgUser(6, 5), 30);

// Invalid inputs fall back to 1
approx(svgUnitsPerScreenPx(null, 200, 200, 1), 1);
approx(svgUnitsPerScreenPx("0 0 100 100", 0, 200, 1), 1);

console.log("test-screen-space: ok");
