import { createRequire } from "module";
import { uploadFile } from "@/lib/storage";
import {
  extractOcadCrsInfo,
  serializeOcadCrs,
  type OcadCrsInfo,
} from "./crs";
import {
  collectSymbolLayersForRender,
  extractOcadLayerTree,
  flattenOcadLayers,
  layersMetadataForSvg,
  objectsForSymbolInGroup,
  OCAD_LAYERS_FORMAT_VERSION,
  type OcadFileWithLayers,
  type OcadMapLayer,
} from "./layers";
import { extractKartramFromOcad, serializeKartramForSvg } from "./kartram";
import type { SvgBounds } from "./svg-utils";

const require = createRequire(import.meta.url);
const { readOcad, ocadToSvg } = require("ocad2geojson") as {
  readOcad: (
    input: Buffer,
    options?: { quietWarnings?: boolean },
  ) => Promise<OcadFileWithLayers & {
    objects: Array<{ objIndex: { _index: number } }>;
    getBounds: () => number[];
  }>;
  ocadToSvg: (
    ocadFile: unknown,
    options: { document: Document; objects?: unknown[]; exportHidden?: boolean },
  ) => Element;
};
const { DOMImplementation, XMLSerializer } = require("xmldom") as {
  DOMImplementation: new () => { createDocument: (ns: null, q: null, doc: null) => Document };
  XMLSerializer: new () => { serializeToString: (node: Node) => string };
};

type OcadFile = OcadFileWithLayers & {
  objects: Array<{ objIndex: { _index: number }; sym: number }>;
  getBounds: () => number[];
  getCrs: () => {
    easting?: number;
    northing?: number;
    scale?: number;
    grivation?: number;
    code?: number;
    name?: string | null;
  };
  header: { version: number };
};

function mapScaleFromOcad(ocadFile: OcadFile): number {
  const scale = ocadFile.getCrs()?.scale;
  return typeof scale === "number" && Number.isFinite(scale) && scale > 0 ? scale : 15000;
}

function crsFromOcad(ocadFile: OcadFile): OcadCrsInfo {
  return (
    extractOcadCrsInfo(ocadFile.getCrs()) ?? {
      easting: 0,
      northing: 0,
      scale: mapScaleFromOcad(ocadFile),
      grivation: 0,
      epsg: 0,
      name: null,
    }
  );
}

function applySvgMetadata(svgElement: Element, ocadFile: OcadFile): void {
  const crs = crsFromOcad(ocadFile);
  svgElement.setAttribute("data-ocad-scale", String(crs.scale));
  svgElement.setAttribute("data-ocad-version", String(ocadFile.header.version));
  svgElement.setAttribute("data-ocad-crs", serializeOcadCrs(crs));
  applyKartramMetadata(svgElement, ocadFile);
}

function applyKartramMetadata(svgElement: Element, ocadFile: OcadFile): void {
  const rawBounds = ocadFile.getBounds();
  if (!rawBounds || rawBounds.length < 4) return;
  const yFlip = rawBounds[1] + rawBounds[3];
  const kartramInfo = extractKartramFromOcad(
    ocadFile as Parameters<typeof extractKartramFromOcad>[0],
    yFlip,
  );
  if (!kartramInfo) return;
  svgElement.setAttribute("data-ocad-kartram", serializeKartramForSvg(kartramInfo));
}

function kartramAttributeForOcad(ocadFile: OcadFile): string {
  const rawBounds = ocadFile.getBounds();
  if (!rawBounds || rawBounds.length < 4) return "";
  const yFlip = rawBounds[1] + rawBounds[3];
  const kartramInfo = extractKartramFromOcad(
    ocadFile as Parameters<typeof extractKartramFromOcad>[0],
    yFlip,
  );
  if (!kartramInfo) return "";
  return ` data-ocad-kartram="${escapeXmlAttr(serializeKartramForSvg(kartramInfo))}"`;
}

function boundsFromOcad(ocadFile: OcadFile): SvgBounds | null {
  const raw = ocadFile.getBounds();
  if (!raw || raw.length < 4) return null;
  const [minX, minY, maxX, maxY] = raw;
  return { minX, minY, maxX, maxY };
}

function filterObjectsByIndex(ocadFile: OcadFile, indices: Set<number>): unknown[] {
  if (indices.size === 0) return [];
  return ocadFile.objects.filter((obj) => {
    const index = obj.objIndex?._index;
    return index != null && indices.has(index);
  });
}

/** xmldom only serializes id when set via setAttribute, not node.id */
function ensureSvgElementIds(root: Element): void {
  const elements = root.getElementsByTagName("*");
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i] as Element & { id?: string };
    if (el.id) {
      el.setAttribute("id", el.id);
    }
  }
}

function serializeSvg(svgElement: Element, viewBounds: SvgBounds, ocadFile: OcadFile): string {
  svgElement.setAttribute(
    "viewBox",
    `${viewBounds.minX} ${viewBounds.minY} ${viewBounds.maxX - viewBounds.minX} ${viewBounds.maxY - viewBounds.minY}`,
  );
  svgElement.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svgElement.setAttribute("width", "100%");
  svgElement.setAttribute("height", "100%");
  svgElement.setAttribute("preserveAspectRatio", "xMidYMid meet");
  applySvgMetadata(svgElement, ocadFile);
  ensureSvgElementIds(svgElement);
  const serializer = new XMLSerializer();
  return serializer.serializeToString(svgElement);
}

export async function getOcadMapScale(buffer: Buffer): Promise<number> {
  const ocadFile = (await readOcad(buffer, { quietWarnings: true })) as OcadFile;
  return mapScaleFromOcad(ocadFile);
}

export function injectOcadScaleAttribute(svgText: string, scale: number): string {
  if (/data-ocad-scale=["']/i.test(svgText)) return svgText;
  return svgText.replace(/<svg/i, `<svg data-ocad-scale="${scale}"`);
}

export function injectOcadVersionAttribute(svgText: string, version: number): string {
  if (/data-ocad-version=["']/i.test(svgText)) return svgText;
  return svgText.replace(/<svg/i, `<svg data-ocad-version="${version}"`);
}

export function injectOcadCrsAttribute(svgText: string, crs: OcadCrsInfo): string {
  const encoded = escapeXmlAttr(serializeOcadCrs(crs));
  if (/data-ocad-crs=["']/i.test(svgText)) {
    return svgText.replace(/data-ocad-crs=["'][^"']*["']/i, `data-ocad-crs="${encoded}"`);
  }
  return svgText.replace(/<svg/i, `<svg data-ocad-crs="${encoded}"`);
}

export function svgBufferHasMetadata(buffer: Buffer): boolean {
  const head = buffer.subarray(0, Math.min(buffer.length, 4096)).toString("utf-8");
  return (
    /data-ocad-scale=["']/i.test(head) &&
    /data-ocad-version=["']/i.test(head) &&
    /data-ocad-crs=["']/i.test(head)
  );
}

export function svgBufferHasLayers(buffer: Buffer): boolean {
  const head = buffer.subarray(0, Math.min(buffer.length, 8192)).toString("utf-8");
  if (!/data-ocad-layers=["']/i.test(head)) return false;
  const versionMatch = head.match(/data-ocad-layers-version=["'](\d+)["']/i);
  if (!versionMatch) return false;
  return Number(versionMatch[1]) >= OCAD_LAYERS_FORMAT_VERSION;
}

async function renderSymbolLayerMarkup(
  ocadFile: OcadFile,
  layer: OcadMapLayer,
  serializer: XMLSerializer,
): Promise<string | null> {
  if (layer.kind !== "symbol" || layer.symbolNum == null) return null;

  const symbolObjects = objectsForSymbolInGroup(ocadFile, layer.groupId, layer.symbolNum);
  if (symbolObjects.length === 0) return null;

  const document = new DOMImplementation().createDocument(null, null, null);
  const symbolSvg = ocadToSvg(ocadFile, {
    document,
    objects: symbolObjects,
    exportHidden: true,
  }) as Element;
  const { childrenMarkup } = extractInnerGroupMarkup(symbolSvg, serializer);
  const displayAttr = layer.visible ? "" : ' display="none"';

  return `<g data-ocad-layer-id="${layer.id}" data-ocad-layer-type="symbol" data-ocad-group-id="${layer.groupId}" data-ocad-symbol="${layer.symbolNum}" data-ocad-draw-order="${layer.drawOrder ?? 0}" data-ocad-layer-name="${escapeXmlAttr(layer.name)}"${displayAttr}>${childrenMarkup}</g>`;
}

async function renderFlatSymbolLayers(
  ocadFile: OcadFile,
  layerTree: OcadMapLayer[],
  serializer: XMLSerializer,
): Promise<string[]> {
  const symbolLayers = collectSymbolLayersForRender(layerTree);
  const parts = await Promise.all(
    symbolLayers.map((layer) => renderSymbolLayerMarkup(ocadFile, layer, serializer)),
  );
  return parts.filter(Boolean) as string[];
}

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function extractInnerGroupMarkup(svgElement: Element, serializer: XMLSerializer): {
  transform: string | null;
  childrenMarkup: string;
  defsMarkup: string;
} {
  ensureSvgElementIds(svgElement);
  const mapGroup = svgElement.getElementsByTagName("g")[0] as Element | undefined;
  const defs = svgElement.getElementsByTagName("defs")[0] as Element | undefined;
  const childrenMarkup = mapGroup
    ? Array.from(mapGroup.childNodes)
        .map((node) => serializer.serializeToString(node))
        .join("")
    : "";
  const defsMarkup = defs
    ? Array.from(defs.childNodes)
        .map((node) => serializer.serializeToString(node))
        .join("")
    : "";
  return {
    transform: mapGroup?.getAttribute("transform") ?? null,
    childrenMarkup,
    defsMarkup,
  };
}

export async function generateOcadSvgLayered(buffer: Buffer): Promise<{
  svg: string;
  bounds: SvgBounds | null;
  layers: OcadMapLayer[];
}> {
  const ocadFile = (await readOcad(buffer, { quietWarnings: true })) as OcadFile;
  const bounds = boundsFromOcad(ocadFile);
  const layerTree = extractOcadLayerTree(ocadFile);
  const serializer = new XMLSerializer();

  if (layerTree.length === 0) {
    const flatSvg = await generateOcadSvgFlat(buffer, ocadFile, bounds);
    return { svg: flatSvg, bounds, layers: [] };
  }

  const rawBounds = ocadFile.getBounds();
  const yFlip = rawBounds[1] + rawBounds[3];
  const rootTransform = `translate(0, ${yFlip})`;

  const fullDoc = new DOMImplementation().createDocument(null, null, null);
  const fullSvg = ocadToSvg(ocadFile, { document: fullDoc, exportHidden: true }) as Element;
  const { defsMarkup } = extractInnerGroupMarkup(fullSvg, serializer);

  const layerMarkupParts = await renderFlatSymbolLayers(ocadFile, layerTree, serializer);

  const assignedObjectIndices = new Set<number>();
  for (const layer of flattenOcadLayers(layerTree)) {
    if (layer.kind !== "symbol" || layer.symbolNum == null) continue;
    for (const obj of objectsForSymbolInGroup(ocadFile, layer.groupId, layer.symbolNum)) {
      const idx = obj.objIndex?._index;
      if (idx != null) assignedObjectIndices.add(idx);
    }
  }

  const unassignedObjects = ocadFile.objects.filter((obj) => {
    const index = obj.objIndex?._index;
    return index == null || !assignedObjectIndices.has(index);
  });

  const layers = [...layerTree];
  if (unassignedObjects.length > 0) {
    const document = new DOMImplementation().createDocument(null, null, null);
    const otherSvg = ocadToSvg(ocadFile, {
      document,
      objects: unassignedObjects,
      exportHidden: true,
    }) as Element;
    const { childrenMarkup } = extractInnerGroupMarkup(otherSvg, serializer);
    layerMarkupParts.push(
      `<g data-ocad-layer-id="other" data-ocad-layer-type="group" data-ocad-layer-name="Övriga objekt">${childrenMarkup}</g>`,
    );
    layers.push({
      id: "other",
      groupId: -1,
      kind: "group",
      name: "Övriga objekt",
      visible: true,
      locked: false,
      objectCount: unassignedObjects.length,
      children: [],
    });
  }

  const layersJson = escapeXmlAttr(JSON.stringify(layersMetadataForSvg(layers)));

  const viewBox = bounds
    ? `${bounds.minX} ${bounds.minY} ${bounds.maxX - bounds.minX} ${bounds.maxY - bounds.minY}`
    : "0 0 100 100";

  const crs = crsFromOcad(ocadFile);
  const kartramAttr = kartramAttributeForOcad(ocadFile);
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg"`,
    `viewBox="${viewBox}"`,
    `width="100%" height="100%"`,
    `preserveAspectRatio="xMidYMid meet"`,
    `fill="transparent"`,
    `data-ocad-scale="${crs.scale}"`,
    `data-ocad-version="${ocadFile.header.version}"`,
    `data-ocad-crs="${escapeXmlAttr(serializeOcadCrs(crs))}"`,
    `data-ocad-layers-version="${OCAD_LAYERS_FORMAT_VERSION}"`,
    `data-ocad-layers="${layersJson}"${kartramAttr}>`,
    defsMarkup ? `<defs>${defsMarkup}</defs>` : "",
    `<g transform="${rootTransform}">`,
    layerMarkupParts.join(""),
    `</g>`,
    `</svg>`,
  ].join("");

  return { svg, bounds, layers };
}

async function generateOcadSvgFlat(
  buffer: Buffer,
  ocadFile?: OcadFile,
  bounds?: SvgBounds | null,
): Promise<string> {
  const file = ocadFile ?? ((await readOcad(buffer, { quietWarnings: true })) as OcadFile);
  const fileBounds = bounds ?? boundsFromOcad(file);
  const document = new DOMImplementation().createDocument(null, null, null);
  const svgElement = ocadToSvg(file, { document }) as Element;

  if (fileBounds) {
    svgElement.setAttribute(
      "viewBox",
      `${fileBounds.minX} ${fileBounds.minY} ${fileBounds.maxX - fileBounds.minX} ${fileBounds.maxY - fileBounds.minY}`,
    );
  }

  svgElement.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svgElement.setAttribute("width", "100%");
  svgElement.setAttribute("height", "100%");
  svgElement.setAttribute("preserveAspectRatio", "xMidYMid meet");
  applySvgMetadata(svgElement, file);
  ensureSvgElementIds(svgElement);

  const serializer = new XMLSerializer();
  return serializer.serializeToString(svgElement);
}

export async function getOcadMetadata(
  buffer: Buffer,
): Promise<{ scale: number; version: number; crs: OcadCrsInfo }> {
  const ocadFile = (await readOcad(buffer, { quietWarnings: true })) as OcadFile;
  const crs = crsFromOcad(ocadFile);
  return {
    scale: crs.scale,
    version: ocadFile.header.version,
    crs,
  };
}

export function injectOcadMetadataAttributes(
  svgText: string,
  metadata: { scale: number; version: number; crs: OcadCrsInfo },
): string {
  let result = injectOcadScaleAttribute(svgText, metadata.scale);
  result = injectOcadVersionAttribute(result, metadata.version);
  result = injectOcadCrsAttribute(result, metadata.crs);
  return result;
}

export async function ensureSvgMetadata(
  svgBuffer: Buffer,
  ocdBuffer: Buffer,
): Promise<{ buffer: Buffer; changed: boolean }> {
  if (svgBufferHasMetadata(svgBuffer)) {
    return { buffer: svgBuffer, changed: false };
  }

  const metadata = await getOcadMetadata(ocdBuffer);
  const svgText = injectOcadMetadataAttributes(svgBuffer.toString("utf-8"), metadata);
  return { buffer: Buffer.from(svgText, "utf-8"), changed: true };
}

export async function generateOcadSvg(buffer: Buffer): Promise<{
  svg: string;
  bounds: SvgBounds | null;
}> {
  const { svg, bounds } = await generateOcadSvgLayered(buffer);
  return { svg, bounds };
}

export async function generateOcadSvgFiltered(
  buffer: Buffer,
  objectIndices: Set<number>,
  viewBounds: SvgBounds,
): Promise<string> {
  const ocadFile = (await readOcad(buffer, { quietWarnings: true })) as OcadFile;
  const filtered = filterObjectsByIndex(ocadFile, objectIndices);
  const document = new DOMImplementation().createDocument(null, null, null);
  const svgElement = ocadToSvg(ocadFile, { document, objects: filtered }) as Element;
  applySvgMetadata(svgElement, ocadFile);
  return serializeSvg(svgElement, viewBounds, ocadFile);
}

export function buildPreviewSvgPath(mapFileId: string, versionNumber: number): string {
  return `maps/${mapFileId}/v${versionNumber}/preview.svg`;
}

/**
 * Store a flat (non-layered) preview SVG.
 * Layered generation runs ocadToSvg many times and OOMs on Vercel for ~20 MB maps.
 * Checkout and map view work with flat SVG; layers can be upgraded later when memory allows.
 */
export async function generateAndStorePreviewSvg(
  buffer: Buffer,
  storagePath: string,
): Promise<SvgBounds | null> {
  const ocadFile = (await readOcad(buffer, { quietWarnings: true })) as OcadFile;
  const bounds = boundsFromOcad(ocadFile);
  const svg = await generateOcadSvgFlat(buffer, ocadFile, bounds);
  await uploadFile(storagePath, Buffer.from(svg, "utf-8"));
  return bounds;
}
