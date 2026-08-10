const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;

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

  const lines = pdf.splitTextToSize(text, CONTENT_W) as string[];
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

const SVG_RASTER_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(null);
      });
  });
}

async function svgElementToPngInner(
  svg: SVGElement,
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  const clone = svg.cloneNode(true) as SVGElement;
  if (!clone.getAttribute("xmlns")) {
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }

  const viewBox = clone.getAttribute("viewBox")?.split(/\s+/).map(Number);
  const rect = svg.getBoundingClientRect();
  const width =
    viewBox && viewBox.length >= 4
      ? viewBox[2]!
      : rect.width || Number(clone.getAttribute("width")) || 400;
  const height =
    viewBox && viewBox.length >= 4
      ? viewBox[3]!
      : rect.height || Number(clone.getAttribute("height")) || 300;

  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));

  const svgString = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  return await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = 2;
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve({
          dataUrl: canvas.toDataURL("image/png"),
          width: canvas.width,
          height: canvas.height,
        });
      } catch {
        resolve(null);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

async function svgElementToPng(
  svg: SVGElement,
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  try {
    return await withTimeout(svgElementToPngInner(svg), SVG_RASTER_TIMEOUT_MS);
  } catch {
    return null;
  }
}

async function waitForDiagrams(root: HTMLElement, timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const figures = [...root.querySelectorAll("figure")];
    const pending = figures.some((figure) => {
      if (figure.querySelector("[class*='text-red-600']")) return false;
      if (figure.querySelector("svg")) return false;
      return !!figure.querySelector("figcaption");
    });
    if (!pending) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
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
    const title = elementText(node.querySelector("figcaption"));
    const caption = elementText(node.querySelector("p.text-xs"));
    const svg = node.querySelector("svg");

    if (title) {
      y = ensureSpace(pdf, y, 8);
      y = addWrappedText(pdf, title, y, { fontSize: 10, bold: true, color: [60, 60, 60] });
    }

    if (svg instanceof SVGElement) {
      const png = await svgElementToPng(svg);
      if (png) {
        const maxW = CONTENT_W;
        const maxH = 90;
        const { w, h } = fitImage(png.width, png.height, maxW, maxH);
        y = ensureSpace(pdf, y, h + 4);
        try {
          pdf.addImage(png.dataUrl, "PNG", MARGIN, y, w, h);
          y += h + 3;
        } catch {
          // Skip diagram image if raster data is invalid.
        }
      }
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
