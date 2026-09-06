/**
 * Exporterar docs/sjalvstudier-kursmaterial.md till PDF med inbäddade bilder och Mermaid-diagram.
 *
 *   cd web && npm run docs:pdf
 */
import { readFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { Marked } from "../web/node_modules/marked/lib/marked.esm.js";
import { chromium } from "../web/node_modules/playwright/index.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const docsDir = scriptDir;
const repoRoot = path.resolve(docsDir, "..");
const webDir = path.join(repoRoot, "web");
const markdownPath = path.join(docsDir, "sjalvstudier-kursmaterial.md");
const imagesDir = path.join(docsDir, "bilder");
const htmlPath = path.join(docsDir, "sjalvstudier-kursmaterial.html");
const pdfPath = path.join(docsDir, "sjalvstudier-kursmaterial.pdf");
const mermaidPath = path.join(webDir, "node_modules/mermaid/dist/mermaid.min.js");

function stripMarkers(markdown: string): string {
  return markdown
    .replace(/<!--\s*(?:bild|diagram):[\w.-]+\s*-->\n?/g, "")
    .replace(/<!--\s*\/(?:bild|diagram):[\w.-]+\s*-->\n?/g, "");
}

async function imageDataUrl(relativePath: string): Promise<string | null> {
  const file = path.join(docsDir, relativePath.replace(/^\.\//, ""));
  try {
    const buffer = await readFile(file);
    return `data:image/png;base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

function buildMarked(): Marked {
  const marked = new Marked({ gfm: true, breaks: false });

  marked.use({
    renderer: {
      code({ text, lang }) {
        if (lang === "mermaid") {
          return `<div class="mermaid">${text.replace(/</g, "&lt;")}</div>\n`;
        }
        return `<pre><code>${text.replace(/</g, "&lt;")}</code></pre>\n`;
      },
      image({ href, title, text }) {
        const alt = text.replace(/"/g, "&quot;");
        const titleAttr = title ? ` title="${title.replace(/"/g, "&quot;")}"` : "";
        return `<figure class="screenshot"><img src="${href}" alt="${alt}"${titleAttr} loading="eager" /><figcaption>${alt}</figcaption></figure>\n`;
      },
      table(token) {
        const header = token.header
          .map((cell, i) => {
            const align = token.align[i] ? ` style="text-align:${token.align[i]}"` : "";
            return `<th${align}>${cell.text}</th>`;
          })
          .join("");
        const body = token.rows
          .map(
            (row) =>
              `<tr>${row
                .map((cell, i) => {
                  const align = token.align[i] ? ` style="text-align:${token.align[i]}"` : "";
                  return `<td${align}>${cell.text}</td>`;
                })
                .join("")}</tr>`,
          )
          .join("");
        return `<table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>\n`;
      },
      checkbox({ checked }) {
        return checked ? "☑ " : "☐ ";
      },
      link({ href, text }) {
        if (href.startsWith("#")) return text;
        return `${text} (${href})`;
      },
    },
  });

  return marked;
}

async function embedImages(html: string): Promise<string> {
  const pattern = /src="(bilder\/[^"]+\.png)"/g;
  const paths = [...html.matchAll(pattern)].map((m) => m[1]);
  let out = html;
  for (const rel of new Set(paths)) {
    const dataUrl = await imageDataUrl(rel);
    if (dataUrl) out = out.replaceAll(`src="${rel}"`, `src="${dataUrl}"`);
  }
  return out;
}

function wrapHtml(body: string): string {
  const exported = new Date().toLocaleString("sv-SE");
  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8" />
  <title>Självstudier — Kartbanken</title>
  <style>
    @page { size: A4; margin: 18mm 16mm; }
    * { box-sizing: border-box; }
    body {
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      font-size: 10.5pt;
      line-height: 1.45;
      color: #1e293b;
      max-width: 178mm;
      margin: 0 auto;
      padding: 0;
    }
    h1 { font-size: 20pt; margin: 1.4em 0 0.5em; page-break-before: always; }
    h1:first-child { page-break-before: avoid; margin-top: 0; }
    h2 { font-size: 14pt; margin: 1.2em 0 0.4em; page-break-after: avoid; }
    h3 { font-size: 11.5pt; margin: 1em 0 0.35em; page-break-after: avoid; }
    h4 { font-size: 10.5pt; margin: 0.8em 0 0.3em; }
    p, li { orphans: 3; widows: 3; }
    p { margin: 0.45em 0; }
    ul, ol { margin: 0.4em 0 0.6em; padding-left: 1.4em; }
    li { margin: 0.15em 0; }
    table { width: 100%; border-collapse: collapse; margin: 0.6em 0 1em; font-size: 9.5pt; }
    th, td { border: 1px solid #cbd5e1; padding: 0.35em 0.5em; vertical-align: top; }
    th { background: #f1f5f9; text-align: left; }
    hr { border: none; border-top: 1px solid #cbd5e1; margin: 1.2em 0; }
    blockquote {
      margin: 0.5em 0;
      padding: 0.5em 0.8em;
      border-left: 3px solid #94a3b8;
      background: #f8fafc;
      color: #475569;
      font-size: 9.5pt;
    }
    strong { font-weight: 600; }
    em { color: #64748b; font-size: 9pt; }
    pre { background: #f8fafc; padding: 0.6em; overflow-x: auto; font-size: 8.5pt; }
    figure.screenshot {
      margin: 0.8em 0 1em;
      page-break-inside: avoid;
    }
    figure.screenshot img {
      display: block;
      max-width: 100%;
      height: auto;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
    }
    figure.screenshot figcaption {
      margin-top: 0.35em;
      font-size: 8.5pt;
      color: #64748b;
    }
    .mermaid {
      margin: 0.8em 0 1em;
      page-break-inside: avoid;
      text-align: center;
    }
    .mermaid svg { max-width: 100%; height: auto !important; }
    .cover-meta { color: #64748b; font-size: 9pt; margin-bottom: 1.2em; }
    .placeholder {
      padding: 0.6em 0.8em;
      border: 1px dashed #cbd5e1;
      background: #fffbeb;
      color: #92400e;
      font-size: 9.5pt;
      page-break-inside: avoid;
    }
  </style>
</head>
<body>
  <p class="cover-meta">Exporterad ${exported} · kartor.ifkmora.se</p>
  ${body}
</body>
</html>`;
}

async function markdownToHtml(markdown: string): Promise<string> {
  const marked = buildMarked();
  let html = marked.parse(stripMarkers(markdown)) as string;
  html = html.replace(
    /\*\*\[BILD ([\d.]+)\]\*\*([^<]*)/g,
    (_match, id: string, rest: string) =>
      `<p class="placeholder"><strong>Bild ${id}</strong>${rest.replace(/\n/g, "<br/>")}</p>`,
  );
  html = await embedImages(html);
  return wrapHtml(html);
}

async function renderPdf(): Promise<void> {
  const markdown = await readFile(markdownPath, "utf-8");
  const html = await markdownToHtml(markdown);
  await writeFile(htmlPath, html, "utf-8");

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`file://${htmlPath.replace(/\\/g, "/")}`, { waitUntil: "load" });

    await page.addScriptTag({ path: mermaidPath });
    await page.evaluate(async () => {
      // @ts-expect-error mermaid loaded via script tag
      const mermaid = window.mermaid;
      mermaid.initialize({
        startOnLoad: false,
        theme: "neutral",
        securityLevel: "loose",
        fontFamily: '"Segoe UI", system-ui, sans-serif',
      });
      await mermaid.run({ querySelector: ".mermaid" });
    });

    await page.waitForFunction(() => {
      const blocks = document.querySelectorAll(".mermaid");
      if (blocks.length === 0) return true;
      return [...blocks].every((el) => el.querySelector("svg"));
    }, { timeout: 60_000 });

    await page.waitForFunction(() => {
      const imgs = [...document.querySelectorAll("figure.screenshot img")] as HTMLImageElement[];
      return imgs.every((img) => img.complete && img.naturalWidth > 0);
    }, { timeout: 30_000 }).catch(() => undefined);

    await page.pdf({
      path: pdfPath,
      format: "A4",
      printBackground: true,
      margin: { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" },
    });
  } finally {
    await browser.close();
  }

  const sizeKb = Math.round((await readFile(pdfPath)).byteLength / 1024);
  console.log(`Skapade ${pdfPath} (${sizeKb} KB)`);
  console.log(`Mellanfil: ${htmlPath}`);
}

void renderPdf().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
