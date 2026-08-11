import { rasterizeSvgElement } from "./diagram-raster";
import { wrapPdfText } from "./pdf-text";

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;
const DIAGRAM_MAX_H = 110;

export type ExportHelpPdfOptions = {
  root: HTMLElement;
  fileName?: string;
  coverTitle?: string;
  coverSubtitle?: string;
  userLabel?: string;
};

function elementText(el: Element | null | undefined): string {
  if (!el) return "";
  return (el as HTMLElement).innerText?.trim() ?? el.textContent?.trim() ?? "";
}

function ensureSpace(pdf: import("jspdf").jsPDF, y: number, needed: number): number {
  if (y + needed > PAGE_H - MARGIN) {
    pdf.addPage();
    return MARGIN;
  }
  return y;
}

function addWrappedText(
  pdf: import("jspdf").jsPDF,
  text: string,
  y: number,
  opts: { fontSize?: number; bold?: boolean; color?: [number, number, number] } = {},
): number {
  const fontSize = opts.fontSize ?? 10;
  pdf.setFontSize(fontSize);
  pdf.setFont("helvetica", opts.bold ? "bold" : "normal");
  if (opts.color) pdf.setTextColor(...opts.color);
  else pdf.setTextColor(0, 0, 0);

  const lines = wrapPdfText(pdf, text, CONTENT_W);
  if (lines.length === 0) return y;

  const lineHeight = fontSize * 0.45;
  y = ensureSpace(pdf, y, lines.length * lineHeight + 2);
  pdf.text(lines, MARGIN, y);
  return y + lines.length * lineHeight + 2;
}

function fitImage(
  imgW: number,
  imgH: number,
  maxW: number,
  maxH: number,
): { w: number; h: number } {
  const scale = Math.min(maxW / imgW, maxH / imgH, 1);
  return { w: imgW * scale, h: imgH * scale };
}

function readPreRasterizedFigure(
  figure: HTMLElement,
): { dataUrl: string; width: number; height: number } | null {
  const dataUrl = figure.dataset.helpDiagramPng;
  const width = Number(figure.dataset.helpDiagramWidth);
  const height = Number(figure.dataset.helpDiagramHeight);
  if (!dataUrl || !Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }
  return { dataUrl, width, height };
}

async function waitForDiagrams(root: HTMLElement, timeoutMs = 30000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const figures = [...root.querySelectorAll("figure")].filter((figure) =>
      figure.querySelector("figcaption"),
    );

    if (figures.length === 0) return;

    const pending = figures.some((figure) => {
      if (figure.dataset.helpDiagramReady === "true") return false;
      if (figure.dataset.helpDiagramReady === "error") return false;
      if (figure.querySelector("[class*='text-red-600']")) return false;
      return true;
    });

    if (!pending) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

function isHidden(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.classList.contains("hidden")) return true;
  const style = window.getComputedStyle(el);
  return style.display === "none" || style.visibility === "hidden";
}

export async function waitForHelpExportRoot(timeoutMs = 10000): Promise<HTMLElement> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const root = document.getElementById("help-export-body");
    if (root?.querySelector("section")) return root;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Kunde inte hitta hjälpinnehållet");
}

export function helpExportDiagramsReady(root: HTMLElement): boolean {
  const figures = [...root.querySelectorAll("figure")].filter((figure) =>
    figure.querySelector("figcaption"),
  );
  if (figures.length === 0) return true;
  return figures.every(
    (figure) =>
      figure.dataset.helpDiagramReady === "true" ||
      figure.dataset.helpDiagramReady === "error" ||
      !!figure.querySelector("[class*='text-red-600']"),
  );
}

async function renderNode(
  pdf: import("jspdf").jsPDF,
  node: Node,
  y: number,
): Promise<number> {
  if (node.nodeType === Node.TEXT_NODE) {
    return y;
  }

  if (!(node instanceof HTMLElement)) return y;

  if (isHidden(node) || node.tagName === "SCRIPT" || node.tagName === "STYLE") {
    return y;
  }

  if (node.dataset.helpExportSkip === "true") {
    return y;
  }

  const tag = node.tagName.toLowerCase();

  if (tag === "h2") {
    y = ensureSpace(pdf, y, 12);
    y += 4;
    return addWrappedText(pdf, node.innerText.trim(), y, { fontSize: 14, bold: true });
  }

  if (tag === "h3") {
    y = ensureSpace(pdf, y, 10);
    y += 2;
    return addWrappedText(pdf, node.innerText.trim(), y, { fontSize: 11, bold: true });
  }

  if (tag === "p") {
    const text = node.innerText.trim();
    if (!text) return y;
    return addWrappedText(pdf, text, y);
  }

  if (tag === "time") {
    return y;
  }

  if (tag === "article") {
    const date = node.querySelector("time")?.innerText.trim();
    const title = node.querySelector("h3")?.innerText.trim();
    if (title) {
      y = ensureSpace(pdf, y, 10);
      const heading = date ? `${date} — ${title}` : title;
      y = addWrappedText(pdf, heading, y, { fontSize: 11, bold: true });
    }
    const items = node.querySelectorAll("li");
    for (const item of items) {
      y = addWrappedText(pdf, `• ${item.innerText.trim()}`, y, { fontSize: 9 });
    }
    y += 2;
    return y;
  }

  if (tag === "ul" || tag === "ol") {
    const items = node.querySelectorAll(":scope > li");
    let index = 0;
    for (const item of items) {
      index += 1;
      const prefix = tag === "ol" ? `${index}. ` : "• ";
      y = addWrappedText(pdf, `${prefix}${elementText(item)}`, y);
    }
    y += 2;
    return y;
  }

  if (tag === "table") {
    const rows = node.querySelectorAll("tr");
    for (const row of rows) {
      const cells = [...row.querySelectorAll("th, td")].map((cell) => elementText(cell));
      if (cells.length === 0) continue;
      y = addWrappedText(pdf, cells.join(" — "), y, { fontSize: 9 });
    }
    y += 2;
    return y;
  }

  if (tag === "figure") {
    const figure = node;
    const title = elementText(figure.querySelector("figcaption"));
    const caption = elementText(figure.querySelector("p.text-xs"));
    const svg = figure.querySelector("svg");

    if (title) {
      y = ensureSpace(pdf, y, 8);
      y = addWrappedText(pdf, title, y, { fontSize: 10, bold: true, color: [60, 60, 60] });
    }

    let png = readPreRasterizedFigure(figure);
    if (!png && svg instanceof SVGElement) {
      png = await rasterizeSvgElement(svg);
    }

    if (png) {
      const maxW = CONTENT_W;
      const { w, h } = fitImage(png.width, png.height, maxW, DIAGRAM_MAX_H);
      y = ensureSpace(pdf, y, h + 4);
      try {
        pdf.addImage(png.dataUrl, "PNG", MARGIN, y, w, h);
        y += h + 3;
      } catch {
        y = addWrappedText(pdf, "(Diagram kunde inte bäddas in)", y, {
          fontSize: 8,
          color: [140, 140, 140],
        });
      }
    } else if (svg instanceof SVGElement) {
      y = addWrappedText(pdf, "(Diagram kunde inte renderas i PDF)", y, {
        fontSize: 8,
        color: [140, 140, 140],
      });
    }

    if (caption) {
      y = addWrappedText(pdf, caption, y, { fontSize: 8, color: [100, 100, 100] });
    }

    y += 2;
    return y;
  }

  if (tag === "section") {
    for (const child of node.childNodes) {
      y = await renderNode(pdf, child, y);
    }
    y += 4;
    return y;
  }

  if (
    tag === "div" ||
    tag === "dl" ||
    tag === "dt" ||
    tag === "dd" ||
    tag === "li" ||
    tag === "span" ||
    tag === "strong" ||
    tag === "em" ||
    tag === "code" ||
    tag === "a"
  ) {
    for (const child of node.childNodes) {
      y = await renderNode(pdf, child, y);
    }
    return y;
  }

  for (const child of node.childNodes) {
    y = await renderNode(pdf, child, y);
  }
  return y;
}

export async function exportHelpPageToPdf(options: ExportHelpPdfOptions): Promise<void> {
  await waitForDiagrams(options.root);

  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  let y = MARGIN;

  pdf.setFontSize(18);
  pdf.setFont("helvetica", "bold");
  pdf.text(options.coverTitle ?? "kartor.ifkmora.se — Hjälp", MARGIN, y);
  y += 10;

  if (options.coverSubtitle) {
    y = addWrappedText(pdf, options.coverSubtitle, y, { fontSize: 10, color: [80, 80, 80] });
  }

  const exportedAt = new Date().toLocaleString("sv-SE");
  y = addWrappedText(pdf, `Exporterad ${exportedAt}`, y, { fontSize: 9, color: [120, 120, 120] });

  if (options.userLabel) {
    y = addWrappedText(pdf, options.userLabel, y, { fontSize: 9, color: [120, 120, 120] });
  }

  y += 4;
  pdf.setDrawColor(200, 200, 200);
  pdf.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 8;

  for (const child of options.root.childNodes) {
    y = await renderNode(pdf, child, y);
  }

  const fileName =
    options.fileName ??
    `kartor-ifkmora-hjalp-${new Date().toISOString().slice(0, 10)}.pdf`;
  pdf.save(fileName);
}
