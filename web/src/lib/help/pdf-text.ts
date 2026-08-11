/** Normalize and wrap text for jsPDF (Helvetica / WinAnsi). */

/** Replace Unicode that breaks Helvetica metrics or splitTextToSize. */
export function normalizePdfText(text: string): string {
  return text
    .replace(/\u00AB/g, '"')
    .replace(/\u00BB/g, '"')
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\u2192/g, "->")
    .replace(/\u2014/g, " - ")
    .replace(/\u2013/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikePerCharacterSplit(lines: string[]): boolean {
  return lines.length > 24 && lines.every((line) => line.length <= 2);
}

function wordWrap(text: string, maxWidth: number, pdf: import("jspdf").jsPDF): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const result: string[] = [];
  let current = words[0]!;

  for (let i = 1; i < words.length; i++) {
    const word = words[i]!;
    const candidate = `${current} ${word}`;
    if (pdf.getTextWidth(candidate) > maxWidth) {
      result.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  result.push(current);
  return result;
}

export function wrapPdfText(
  pdf: import("jspdf").jsPDF,
  text: string,
  maxWidth: number,
): string[] {
  const normalized = normalizePdfText(text);
  if (!normalized) return [];

  const split = pdf.splitTextToSize(normalized, maxWidth) as string | string[];
  const lines = Array.isArray(split) ? split : [split];

  if (looksLikePerCharacterSplit(lines)) {
    return wordWrap(normalized, maxWidth, pdf);
  }

  return lines.filter((line) => line.length > 0);
}
