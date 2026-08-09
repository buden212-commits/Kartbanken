import { jsPDF } from "jspdf";
import sharp from "sharp";
import { formatDateOnly } from "@/lib/format";
import { extractSvgInner } from "@/lib/ocad/svg-utils";
import { readStoredFile } from "@/lib/storage";
import {
  SUGGESTION_CATEGORY_LABELS,
  SUGGESTION_STATUS_LABELS,
  type SuggestionGeometry,
} from "@/lib/suggestion/types";
import { buildSuggestionMapSnippetSvg } from "@/lib/suggestion/export-map-snippet";

export type SuggestionReportItem = {
  id: string;
  status: string;
  category: string;
  title: string | null;
  comment: string;
  createdAt: Date;
  versionNumber: number;
  attachmentPath: string | null;
  createdBy: { name: string | null; email: string };
  geometries: SuggestionGeometry[];
  mapVersionId: string;
};

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;

async function rasterizeSvg(svgMarkup: string): Promise<{ data: string; width: number; height: number } | null> {
  try {
    const png = await sharp(Buffer.from(svgMarkup, "utf-8")).png().toBuffer();
    const meta = await sharp(png).metadata();
    const width = meta.width ?? 400;
    const height = meta.height ?? 300;
    const base64 = png.toString("base64");
    return { data: `data:image/png;base64,${base64}`, width, height };
  } catch {
    return null;
  }
}

async function loadAttachmentImage(
  attachmentPath: string,
): Promise<{ data: string; width: number; height: number } | null> {
  try {
    const buffer = await readStoredFile(attachmentPath);
    const png = await sharp(buffer).rotate().png().toBuffer();
    const meta = await sharp(png).metadata();
    if (!meta.width || !meta.height) return null;
    const base64 = png.toString("base64");
    return { data: `data:image/png;base64,${base64}`, width: meta.width, height: meta.height };
  } catch {
    return null;
  }
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

export async function buildOpenSuggestionsReportPdf(input: {
  mapTitle: string;
  suggestions: SuggestionReportItem[];
  previewByVersionId: Map<string, string>;
}): Promise<Buffer> {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = MARGIN;

  pdf.setFontSize(16);
  pdf.text(`Kartförslag — ${input.mapTitle}`, MARGIN, y);
  y += 8;
  pdf.setFontSize(10);
  pdf.setTextColor(80, 80, 80);
  pdf.text(
    `Exporterad ${formatDateOnly(new Date().toISOString())} · ${input.suggestions.length} förslag`,
    MARGIN,
    y,
  );
  y += 10;
  pdf.setTextColor(0, 0, 0);

  if (input.suggestions.length === 0) {
    pdf.setFontSize(11);
    pdf.text("Inga öppna kartförslag att visa.", MARGIN, y);
    return Buffer.from(pdf.output("arraybuffer"));
  }

  for (let i = 0; i < input.suggestions.length; i++) {
    const s = input.suggestions[i]!;
    if (i > 0) {
      pdf.addPage();
      y = MARGIN;
    }

    const heading =
      s.title?.trim() ||
      SUGGESTION_CATEGORY_LABELS[s.category as keyof typeof SUGGESTION_CATEGORY_LABELS] ||
      "Kartförslag";

    pdf.setFontSize(13);
    pdf.setFont("helvetica", "bold");
    pdf.text(heading, MARGIN, y);
    y += 7;

    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(90, 90, 90);
    const meta = [
      SUGGESTION_STATUS_LABELS[s.status as keyof typeof SUGGESTION_STATUS_LABELS] ?? s.status,
      SUGGESTION_CATEGORY_LABELS[s.category as keyof typeof SUGGESTION_CATEGORY_LABELS] ?? s.category,
      `v${s.versionNumber}`,
      s.createdBy.name?.trim() || s.createdBy.email,
      formatDateOnly(s.createdAt.toISOString()),
    ].join(" · ");
    pdf.text(meta, MARGIN, y);
    y += 6;
    pdf.setTextColor(0, 0, 0);

    pdf.setFontSize(10);
    const commentLines = pdf.splitTextToSize(s.comment, PAGE_W - MARGIN * 2);
    pdf.text(commentLines, MARGIN, y);
    y += commentLines.length * 4.5 + 4;

    const svgText = input.previewByVersionId.get(s.mapVersionId);
    if (svgText && s.geometries.length > 0) {
      const { rootTransform } = extractSvgInner(svgText);
      const snippet = buildSuggestionMapSnippetSvg(svgText, s.geometries, rootTransform);
      if (snippet) {
        const mapImg = await rasterizeSvg(snippet);
        if (mapImg) {
          const maxW = PAGE_W - MARGIN * 2;
          const maxH = 85;
          const { w, h } = fitImage(mapImg.width, mapImg.height, maxW, maxH);
          if (y + h > PAGE_H - MARGIN) {
            pdf.addPage();
            y = MARGIN;
          }
          pdf.setFontSize(9);
          pdf.setTextColor(100, 100, 100);
          pdf.text("Plats på kartan", MARGIN, y);
          y += 4;
          pdf.setTextColor(0, 0, 0);
          pdf.addImage(mapImg.data, "PNG", MARGIN, y, w, h);
          y += h + 6;
        }
      }
    }

    if (s.attachmentPath) {
      const photo = await loadAttachmentImage(s.attachmentPath);
      if (photo) {
        const maxW = PAGE_W - MARGIN * 2;
        const maxH = 90;
        const { w, h } = fitImage(photo.width, photo.height, maxW, maxH);
        if (y + h + 6 > PAGE_H - MARGIN) {
          pdf.addPage();
          y = MARGIN;
        }
        pdf.setFontSize(9);
        pdf.setTextColor(100, 100, 100);
        pdf.text("Foto", MARGIN, y);
        y += 4;
        pdf.setTextColor(0, 0, 0);
        pdf.addImage(photo.data, "PNG", MARGIN, y, w, h);
        y += h + 4;
      }
    }
  }

  return Buffer.from(pdf.output("arraybuffer"));
}
