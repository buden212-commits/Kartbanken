/**
 * Root `<svg …>` tag handling that never touches child elements.
 *
 * SVG:er i Kartbanken innehåller stora `data-ocad-*`-attribut med JSON och en
 * mängd barnnoder som också har `width`/`height`. Dokumentbreda regexar träffar
 * därför fel attribut. Här parsas i stället enbart rot-taggen.
 */

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

export type SvgRootAttribute = {
  name: string;
  /** null för attribut utan värde (`<svg foo>`) */
  value: string | null;
};

export type SvgRootTag = {
  /** Index för `<` i rot-taggen */
  start: number;
  /** Index efter `>` i rot-taggen */
  end: number;
  attributes: SvgRootAttribute[];
  selfClosing: boolean;
};

function isWhitespace(char: string): boolean {
  return char === " " || char === "\t" || char === "\n" || char === "\r" || char === "\f";
}

/** Hoppa över XML-deklaration, kommentarer och doctype fram till första elementet. */
function findRootElementStart(svgText: string): number {
  let i = 0;
  while (i < svgText.length) {
    const lt = svgText.indexOf("<", i);
    if (lt === -1) return -1;

    if (svgText.startsWith("<?", lt)) {
      const end = svgText.indexOf("?>", lt + 2);
      if (end === -1) return -1;
      i = end + 2;
      continue;
    }
    if (svgText.startsWith("<!--", lt)) {
      const end = svgText.indexOf("-->", lt + 4);
      if (end === -1) return -1;
      i = end + 3;
      continue;
    }
    if (svgText.startsWith("<!", lt)) {
      const end = svgText.indexOf(">", lt + 2);
      if (end === -1) return -1;
      i = end + 1;
      continue;
    }
    return lt;
  }
  return -1;
}

/**
 * Tolerant parser för rot-taggens attribut. Klarar attribut som saknar
 * mellanrum emellan (`a="1"b="2"`), enkelcitat och attribut utan värde.
 */
function parseAttributes(tagBody: string): SvgRootAttribute[] {
  const attributes: SvgRootAttribute[] = [];
  let i = 0;

  while (i < tagBody.length) {
    while (i < tagBody.length && (isWhitespace(tagBody[i]!) || tagBody[i] === "/")) i++;
    if (i >= tagBody.length) break;

    const nameStart = i;
    while (
      i < tagBody.length &&
      !isWhitespace(tagBody[i]!) &&
      tagBody[i] !== "=" &&
      tagBody[i] !== "/" &&
      tagBody[i] !== ">"
    ) {
      i++;
    }
    const name = tagBody.slice(nameStart, i);
    if (!name) {
      i++;
      continue;
    }

    let j = i;
    while (j < tagBody.length && isWhitespace(tagBody[j]!)) j++;
    if (tagBody[j] !== "=") {
      attributes.push({ name, value: null });
      i = j;
      continue;
    }

    j++;
    while (j < tagBody.length && isWhitespace(tagBody[j]!)) j++;

    const quote = tagBody[j];
    if (quote === '"' || quote === "'") {
      const close = tagBody.indexOf(quote, j + 1);
      if (close === -1) {
        attributes.push({ name, value: tagBody.slice(j + 1) });
        i = tagBody.length;
        continue;
      }
      attributes.push({ name, value: tagBody.slice(j + 1, close) });
      i = close + 1;
      continue;
    }

    const valueStart = j;
    while (j < tagBody.length && !isWhitespace(tagBody[j]!) && tagBody[j] !== ">") j++;
    attributes.push({ name, value: tagBody.slice(valueStart, j) });
    i = j;
  }

  return attributes;
}

/** Hitta rot-`<svg>`-taggen och parsa dess attribut. */
export function parseSvgRootTag(svgText: string): SvgRootTag | null {
  const start = findRootElementStart(svgText);
  if (start === -1) return null;
  if (!/^<svg(?=[\s/>])/i.test(svgText.slice(start, start + 8))) return null;

  let i = start + 4;
  let quote: string | null = null;
  let end = -1;
  for (; i < svgText.length; i++) {
    const char = svgText[i]!;
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ">") {
      end = i + 1;
      break;
    }
  }
  if (end === -1) return null;

  const rawBody = svgText.slice(start + 4, end - 1);
  const selfClosing = /\/\s*$/.test(rawBody);
  return {
    start,
    end,
    attributes: parseAttributes(rawBody),
    selfClosing,
  };
}

function serializeAttributeValue(value: string): string {
  if (!value.includes('"')) return `"${value}"`;
  if (!value.includes("'")) return `'${value}'`;
  return `"${value.replace(/"/g, "&quot;")}"`;
}

/** Bygg en välformad `<svg …>`-tagg med mellanrum mellan alla attribut. */
export function buildSvgRootTag(attributes: SvgRootAttribute[], selfClosing = false): string {
  const parts = attributes.map((attr) =>
    attr.value === null ? attr.name : `${attr.name}=${serializeAttributeValue(attr.value)}`,
  );
  return `<svg${parts.length ? ` ${parts.join(" ")}` : ""}${selfClosing ? " /" : ""}>`;
}

function upsert(
  attributes: SvgRootAttribute[],
  name: string,
  value: string,
): SvgRootAttribute[] {
  const lower = name.toLowerCase();
  const existing = attributes.findIndex((attr) => attr.name.toLowerCase() === lower);
  if (existing === -1) return [...attributes, { name, value }];
  const next = [...attributes];
  next[existing] = { name: attributes[existing]!.name, value };
  return next;
}

export type SvgRootOverrides = {
  viewBox?: string;
  width?: string;
  height?: string;
  preserveAspectRatio?: string;
  /** Ta bort `data-ocad-*`-attributen (stora JSON-strängar som inte behövs vid rastrering) */
  dropOcadMetadata?: boolean;
};

/**
 * Skriv om rot-taggen — och bara den. Övriga dokumentet lämnas orört.
 * Returnerar originalet om ingen rot-tagg kan hittas.
 */
export function rewriteSvgRootTag(svgText: string, overrides: SvgRootOverrides): string {
  const root = parseSvgRootTag(svgText);
  if (!root) return svgText;

  let attributes = root.attributes;
  if (overrides.dropOcadMetadata) {
    attributes = attributes.filter((attr) => !/^data-ocad-/i.test(attr.name));
  }
  if (!attributes.some((attr) => attr.name.toLowerCase() === "xmlns")) {
    attributes = [{ name: "xmlns", value: SVG_NAMESPACE }, ...attributes];
  }
  if (overrides.viewBox != null) attributes = upsert(attributes, "viewBox", overrides.viewBox);
  if (overrides.width != null) attributes = upsert(attributes, "width", overrides.width);
  if (overrides.height != null) attributes = upsert(attributes, "height", overrides.height);
  if (overrides.preserveAspectRatio != null) {
    attributes = upsert(attributes, "preserveAspectRatio", overrides.preserveAspectRatio);
  }

  return (
    svgText.slice(0, root.start) +
    buildSvgRootTag(attributes, root.selfClosing) +
    svgText.slice(root.end)
  );
}

/** Lägg till ett rot-attribut om det saknas, utan att röra barnelement. */
export function setSvgRootAttribute(
  svgText: string,
  name: string,
  value: string,
): string {
  const root = parseSvgRootTag(svgText);
  if (!root) return svgText;
  return (
    svgText.slice(0, root.start) +
    buildSvgRootTag(upsert(root.attributes, name, value), root.selfClosing) +
    svgText.slice(root.end)
  );
}

export function hasSvgRootAttribute(svgText: string, name: string): boolean {
  const root = parseSvgRootTag(svgText);
  if (!root) return false;
  const lower = name.toLowerCase();
  return root.attributes.some((attr) => attr.name.toLowerCase() === lower);
}
