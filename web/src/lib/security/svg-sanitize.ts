/**
 * Sanerar SVG innan den injiceras i DOM (dangerouslySetInnerHTML).
 * OCAD-previews är normalt säkra, men lagrad SVG ska inte kunna köra script.
 */
export function sanitizeSvgMarkup(svgText: string): string {
  return svgText
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/<(?:iframe|embed|object|link|meta)\b[^>]*\/?>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|xlink:href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1=$2#$2')
    .replace(/<\/?\s*script\b[^>]*>/gi, "");
}

/** Headers för API-svar som serverar SVG (skydd vid direktnavigering). */
export const SVG_RESPONSE_SECURITY_HEADERS: Record<string, string> = {
  "Content-Type": "image/svg+xml; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; sandbox",
};
