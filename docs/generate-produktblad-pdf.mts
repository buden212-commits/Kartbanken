/**
 * Generate produktblad.pdf from produktblad.html using Edge/Chrome headless.
 * Run from repo root: npx tsx docs/generate-produktblad-pdf.mts
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, "produktblad.html");
const pdfPath = path.join(__dirname, "produktblad.pdf");
const htmlUrl = "file:///" + htmlPath.replace(/\\/g, "/");

const browserCandidates = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

const browser = browserCandidates.find((p) => fs.existsSync(p));
if (!browser) {
  console.error("Ingen Chrome/Edge hittades. Öppna docs/produktblad.html och skriv ut som PDF.");
  process.exit(1);
}

const args = [
  "--headless=new",
  "--disable-gpu",
  "--no-pdf-header-footer",
  `--print-to-pdf=${pdfPath}`,
  htmlUrl,
];

const result = spawnSync(browser, args, { encoding: "utf-8" });
if (result.status !== 0) {
  console.error(result.stderr || result.stdout || "PDF-generering misslyckades");
  process.exit(result.status ?? 1);
}

if (!fs.existsSync(pdfPath)) {
  console.error("PDF skapades inte:", pdfPath);
  process.exit(1);
}

const sizeKb = Math.round(fs.statSync(pdfPath).size / 1024);
console.log(`Skapade ${pdfPath} (${sizeKb} KB)`);
