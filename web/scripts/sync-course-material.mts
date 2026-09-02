/**
 * Kopierar kursmaterial från docs/ till web/ så att det kan visas i appen och deployas.
 *
 *   npm run sync:course-material
 */
import { copyFile, mkdir, readdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(webDir, "..");
const docsDir = path.join(repoRoot, "docs");

const sourceMd = path.join(docsDir, "sjalvstudier-kursmaterial.md");
const destMd = path.join(webDir, "src/lib/help/course-material.md");
const sourceImages = path.join(docsDir, "bilder");
const destImages = path.join(webDir, "public/kursmaterial/bilder");
const sourcePdf = path.join(docsDir, "sjalvstudier-kursmaterial.pdf");
const destPdf = path.join(webDir, "public/kursmaterial/sjalvstudier-kursmaterial.pdf");

async function copyImages(): Promise<number> {
  await mkdir(destImages, { recursive: true });
  let count = 0;
  try {
    for (const file of await readdir(sourceImages)) {
      if (!file.endsWith(".png")) continue;
      await copyFile(path.join(sourceImages, file), path.join(destImages, file));
      count += 1;
    }
  } catch {
    console.warn("Inga bilder att kopiera från docs/bilder/");
  }
  return count;
}

async function main(): Promise<void> {
  const markdown = await readFile(sourceMd, "utf-8");
  await writeFile(destMd, markdown, "utf-8");

  const imageCount = await copyImages();

  try {
    await mkdir(path.dirname(destPdf), { recursive: true });
    await copyFile(sourcePdf, destPdf);
    console.log(`PDF kopierad till public/kursmaterial/`);
  } catch {
    console.warn("Ingen PDF att kopiera — kör npm run docs:pdf i web/ först.");
  }

  console.log(`Synkat kursmaterial (${markdown.length} tecken, ${imageCount} bilder).`);
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
