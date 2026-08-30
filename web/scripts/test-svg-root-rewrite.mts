import sharp from "sharp";
import { rewriteSvgRootTag, parseSvgRootTag } from "../src/lib/ocad/svg-root.ts";

/** Mirrors the malformed root tag stored by the old layered SVG generator. */
const brokenSvg =
  `<svg xmlns="http://www.w3.org/2000/svg"` +
  `viewBox="0 0 1000 800"` +
  `width="100%" height="100%"` +
  `preserveAspectRatio="xMidYMid meet"` +
  `fill="transparent"` +
  `data-ocad-scale="15000"` +
  `data-ocad-layers="[{&quot;id&quot;:&quot;g1&quot;,&quot;name&quot;:&quot;Skog&quot;}]">` +
  `<g transform="translate(0,800) scale(0.01,-0.01)">` +
  `<rect x="0" y="0" width="500" height="400" fill="#00ff00" />` +
  `</g></svg>`;

const validSvg =
  `<?xml version="1.0" encoding="UTF-8"?>` +
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 800" width="100%" height="100%">` +
  `<rect x="0" y="0" width="500" height="400" fill="#0000ff" />` +
  `</svg>`;

async function check(name: string, svgText: string) {
  const rewritten = rewriteSvgRootTag(svgText, {
    viewBox: "0 0 500 400",
    width: "512",
    height: "512",
    preserveAspectRatio: "none",
    dropOcadMetadata: true,
  });

  const root = parseSvgRootTag(rewritten);
  if (!root) throw new Error(`${name}: root tag not found after rewrite`);

  const tag = rewritten.slice(root.start, root.end);
  if (/"[a-zA-Z-]+=/.test(tag)) {
    throw new Error(`${name}: attributes still glued together: ${tag}`);
  }
  if (/data-ocad-/i.test(tag)) {
    throw new Error(`${name}: ocad metadata not dropped: ${tag}`);
  }

  const png = await sharp(Buffer.from(rewritten, "utf-8"), {
    density: 96,
    limitInputPixels: false,
  })
    .resize(512, 512, { fit: "fill" })
    .webp({ quality: 80 })
    .toBuffer();

  if (png.byteLength === 0) throw new Error(`${name}: empty raster`);
  console.log(`OK  ${name} — ${png.byteLength} bytes webp`);
  console.log(`    ${tag.slice(0, 120)}`);
}

async function main() {
  // The stored SVG must fail before the fix, proving the repair is what helps.
  let rawFailed = false;
  try {
    await sharp(Buffer.from(brokenSvg, "utf-8")).png().toBuffer();
  } catch (err) {
    rawFailed = true;
    console.log(`OK  malformed SVG rejected by sharp as expected: ${(err as Error).message.slice(0, 90)}`);
  }
  if (!rawFailed) throw new Error("expected malformed SVG to fail before rewrite");

  await check("malformed stored SVG", brokenSvg);
  await check("well-formed SVG", validSvg);
  console.log("\nAll SVG root rewrite checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
