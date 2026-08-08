import { jsPDF } from "jspdf";
import type { OcadObjectChange } from "@/lib/ocad/diff-types";

export type DiffPdfInput = {
  mapTitle: string;
  versionANumber: number;
  versionBNumber: number;
  summary: { added: number; removed: number; modified: number };
  changes: OcadObjectChange[];
};

const PAGE_W = 210;
const MARGIN = 14;
const LINE_H = 5;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export function buildVersionDiffPdf(input: DiffPdfInput): Buffer {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = MARGIN;

  pdf.setFontSize(16);
  pdf.text(`Jämförelserapport — ${input.mapTitle}`, MARGIN, y);
  y += 8;

  pdf.setFontSize(10);
  pdf.text(
    `Version v${input.versionANumber} → v${input.versionBNumber}`,
    MARGIN,
    y,
  );
  y += 6;
  pdf.text(
    `Tillagda: ${input.summary.added} · Borttagna: ${input.summary.removed} · Ändrade: ${input.summary.modified}`,
    MARGIN,
    y,
  );
  y += 10;

  pdf.setFontSize(11);
  pdf.text("Ändringslista", MARGIN, y);
  y += 7;
  pdf.setFontSize(9);

  const maxW = PAGE_W - MARGIN * 2;

  for (const change of input.changes) {
    const label =
      change.changeType === "added"
        ? "+"
        : change.changeType === "removed"
          ? "−"
          : "~";
    const line = `${label} #${change.objectIndex} ${change.symbolNumber} ${change.type ?? ""} ${change.text ?? ""}`.trim();
    const wrapped = pdf.splitTextToSize(truncate(line, 200), maxW) as string[];

    if (y + wrapped.length * LINE_H > 280) {
      pdf.addPage();
      y = MARGIN;
    }

    pdf.text(wrapped, MARGIN, y);
    y += wrapped.length * LINE_H + 1;
  }

  if (input.changes.length === 0) {
    pdf.text("Inga objektändringar registrerades.", MARGIN, y);
  }

  return Buffer.from(pdf.output("arraybuffer"));
}
