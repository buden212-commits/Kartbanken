export type OcadMapLayer = {
  id: string;
  groupId: number;
  name: string;
  visible: boolean;
  locked: boolean;
  objectCount: number;
  kind: "group" | "symbol";
  symbolNum?: number;
  /** OCAD symbol type: 1 point, 2 line, 3 area, 7 rectangle */
  symbolType?: number;
  drawOrder?: number;
  minObjectIndex?: number;
  children?: OcadMapLayer[];
};

type SymTreeEntry = {
  _first?: string;
  g?: string | number;
  /** OCAD 9: first node in subgroup — not visibility */
  f?: string | number;
  /** OCAD 9: last node in subgroup — not locked */
  l?: string | number;
  /** OCAD 9/12: visible (1 = visible, 0 = hidden) */
  v?: string | number;
  /** OCAD 9/12: tree node expanded */
  e?: string | number;
  i?: string | number;
};

type OcadColor = {
  renderOrder?: number;
};

type OcadSymbol = {
  symNum: number;
  number?: string;
  description?: string;
  group?: number;
  type?: number;
  colors?: number[];
  symbolTreeGroup?: number[];
  isHidden: () => boolean;
};

type OcadObject = {
  sym: number;
  objIndex?: { _index: number };
};

export type OcadFileWithLayers = {
  objects: OcadObject[];
  symbols: OcadSymbol[];
  colors?: Array<OcadColor | undefined>;
  parameterStrings: Record<number, SymTreeEntry[] | undefined>;
};

export function symbolDrawOrder(
  ocadFile: OcadFileWithLayers,
  symbol: OcadSymbol,
): number {
  let max = 0;
  for (const colorIndex of symbol.colors ?? []) {
    const color = ocadFile.colors?.[colorIndex];
    if (color?.renderOrder != null) {
      max = Math.max(max, color.renderOrder);
    }
  }
  return max;
}

function symbolMinObjectIndex(
  ocadFile: OcadFileWithLayers,
  groupId: number,
  symNum: number,
): number {
  let min = Number.MAX_SAFE_INTEGER;
  for (const obj of objectsForSymbolInGroup(ocadFile, groupId, symNum)) {
    const idx = obj.objIndex?._index;
    if (idx != null) min = Math.min(min, idx);
  }
  return min === Number.MAX_SAFE_INTEGER ? 0 : min;
}

function compareSymbolLayers(a: OcadMapLayer, b: OcadMapLayer): number {
  const orderA = a.drawOrder ?? 0;
  const orderB = b.drawOrder ?? 0;
  if (orderA !== orderB) return orderB - orderA;
  const idxA = a.minObjectIndex ?? 0;
  const idxB = b.minObjectIndex ?? 0;
  if (idxA !== idxB) return idxA - idxB;
  return (a.symbolNum ?? 0) - (b.symbolNum ?? 0);
}

export function symbolInGroup(symbol: OcadSymbol, groupId: number): boolean {
  if (typeof symbol.group === "number") {
    return (
      symbol.group === groupId ||
      (symbol.group & 0xff) === groupId ||
      (symbol.group >> 8) === groupId
    );
  }
  return (
    symbol.symbolTreeGroup?.some(
      (word) => word === groupId || (word & 0xff) === groupId || (word >> 8) === groupId,
    ) ?? false
  );
}

function symbolForObject(ocadFile: OcadFileWithLayers, obj: OcadObject): OcadSymbol | undefined {
  return ocadFile.symbols.find((s) => s.symNum === obj.sym);
}

export function objectsForLayer(ocadFile: OcadFileWithLayers, groupId: number): OcadObject[] {
  return ocadFile.objects.filter((obj) => {
    const sym = symbolForObject(ocadFile, obj);
    return sym != null && symbolInGroup(sym, groupId);
  });
}

export function objectsForSymbolInGroup(
  ocadFile: OcadFileWithLayers,
  groupId: number,
  symbolNum: number,
): OcadObject[] {
  return ocadFile.objects.filter((obj) => {
    if (obj.sym !== symbolNum) return false;
    const sym = symbolForObject(ocadFile, obj);
    return sym != null && symbolInGroup(sym, groupId);
  });
}

export function formatOcadSymbolNumber(symNum: number): string {
  return `${Math.floor(symNum / 1000)}.${String(symNum % 1000).padStart(3, "0")}`;
}

function symbolLabel(symbol: OcadSymbol): string {
  const number = formatOcadSymbolNumber(symbol.symNum);
  const desc = symbol.description?.trim();
  return desc ? `${number} ${desc}` : number;
}

function symtreeFlagOn(value: string | number | undefined): boolean {
  return value === "1" || value === 1;
}

function symtreeVisible(entry: SymTreeEntry): boolean {
  // OCAD stores visibility in `v`. Some files (OCAD 9 symtree layout) omit it;
  // `f`/`l` are tree-structure markers, not visibility/lock flags.
  if (entry.v === undefined) return true;
  return symtreeFlagOn(entry.v);
}

function symtreeLocked(_entry: SymTreeEntry): boolean {
  return false;
}

function buildSymbolSubLayers(
  ocadFile: OcadFileWithLayers,
  groupId: number,
  groupVisible: boolean,
): OcadMapLayer[] {
  const symbolCounts = new Map<number, number>();

  for (const sym of ocadFile.symbols) {
    if (symbolInGroup(sym, groupId) && !symbolCounts.has(sym.symNum)) {
      symbolCounts.set(sym.symNum, 0);
    }
  }

  for (const obj of ocadFile.objects) {
    const sym = symbolForObject(ocadFile, obj);
    if (!sym || !symbolInGroup(sym, groupId)) continue;
    symbolCounts.set(sym.symNum, (symbolCounts.get(sym.symNum) ?? 0) + 1);
  }

  const children: OcadMapLayer[] = [];

  for (const [symNum, count] of symbolCounts.entries()) {
    const sym = ocadFile.symbols.find((s) => s.symNum === symNum);
    if (!sym) continue;

    children.push({
      id: `g${groupId}-s${symNum}`,
      groupId,
      symbolNum: symNum,
      symbolType: sym.type,
      kind: "symbol",
      name: symbolLabel(sym),
      visible: groupVisible && !sym.isHidden(),
      locked: false,
      objectCount: count,
      drawOrder: symbolDrawOrder(ocadFile, sym),
      minObjectIndex: symbolMinObjectIndex(ocadFile, groupId, symNum),
    });
  }

  children.sort(compareSymbolLayers);
  return children;
}

function buildGroupLayer(
  ocadFile: OcadFileWithLayers,
  entry: SymTreeEntry,
): OcadMapLayer | null {
  const groupId = Number(entry.g);
  if (!Number.isFinite(groupId) || groupId < 0) return null;

  const name = String(entry._first ?? groupId).trim();
  const visible = symtreeVisible(entry);
  const children = buildSymbolSubLayers(ocadFile, groupId, visible);
  const objectCount = children.reduce((sum, child) => sum + child.objectCount, 0);

  return {
    id: `g${groupId}`,
    groupId,
    kind: "group",
    name,
    visible,
    locked: symtreeLocked(entry),
    objectCount,
    children,
  };
}

type SymTreeNode = {
  entry: SymTreeEntry;
  children: SymTreeNode[];
};

function buildSymtreeHierarchy(symtree: SymTreeEntry[]): SymTreeNode[] {
  const roots: SymTreeNode[] = [];
  const stack: { node: SymTreeNode; level: number }[] = [];

  for (const entry of symtree) {
    const level = Number(entry.i);
    const node: SymTreeNode = { entry, children: [] };

    while (stack.length > 0 && stack[stack.length - 1]!.level >= level) {
      stack.pop();
    }

    if (stack.length === 0) {
      roots.push(node);
    } else {
      stack[stack.length - 1]!.node.children.push(node);
    }

    stack.push({ node, level: Number.isFinite(level) ? level : 0 });
  }

  return roots;
}

function collectGroupLayersFromNode(
  ocadFile: OcadFileWithLayers,
  node: SymTreeNode,
  out: OcadMapLayer[],
): void {
  const groupId = Number(node.entry.g);
  if (Number.isFinite(groupId) && groupId >= 0) {
    const layer = buildGroupLayer(ocadFile, node.entry);
    if (layer) out.push(layer);
  }

  for (const child of node.children) {
    collectGroupLayersFromNode(ocadFile, child, out);
  }
}

export function extractOcadLayerTree(ocadFile: OcadFileWithLayers): OcadMapLayer[] {
  const symtree = ocadFile.parameterStrings[15] ?? [];
  if (symtree.length === 0) return [];

  const hierarchy = buildSymtreeHierarchy(symtree);
  const layers: OcadMapLayer[] = [];

  for (const root of hierarchy) {
    collectGroupLayersFromNode(ocadFile, root, layers);
  }

  if (layers.length === 0) {
    for (const entry of symtree) {
      const layer = buildGroupLayer(ocadFile, entry);
      if (layer) layers.push(layer);
    }
  }

  return layers;
}

/** @deprecated Use extractOcadLayerTree — flat list of top-level groups only */
export function extractOcadLayers(ocadFile: OcadFileWithLayers): OcadMapLayer[] {
  return extractOcadLayerTree(ocadFile);
}

export function flattenOcadLayers(layers: OcadMapLayer[]): OcadMapLayer[] {
  const flat: OcadMapLayer[] = [];

  function walk(nodes: OcadMapLayer[]) {
    for (const node of nodes) {
      flat.push(node);
      if (node.children?.length) walk(node.children);
    }
  }

  walk(layers);
  return flat;
}

export function initialLayerVisibility(layers: OcadMapLayer[]): Record<string, boolean> {
  return Object.fromEntries(
    flattenOcadLayers(layers).map((layer) => [layer.id, layer.visible]),
  );
}

export function unassignedObjectCount(ocadFile: OcadFileWithLayers, layers: OcadMapLayer[]): number {
  const layerIds = new Set(
    flattenOcadLayers(layers)
      .filter((l) => l.kind === "group")
      .map((l) => l.groupId),
  );
  return ocadFile.objects.filter((obj) => {
    const sym = symbolForObject(ocadFile, obj);
    if (!sym) return true;
    return ![...layerIds].some((groupId) => symbolInGroup(sym, groupId));
  }).length;
}

export function collectSymbolLayersForRender(layers: OcadMapLayer[]): OcadMapLayer[] {
  return flattenOcadLayers(layers)
    .filter((layer) => layer.kind === "symbol")
    .sort(compareSymbolLayers);
}

export const OCAD_LAYERS_FORMAT_VERSION = 6;

export function layersMetadataForSvg(layers: OcadMapLayer[]): OcadMapLayer[] {
  return layers.map((layer) => ({
    id: layer.id,
    groupId: layer.groupId,
    name: layer.name,
    visible: layer.visible,
    locked: layer.locked,
    objectCount: layer.objectCount,
    kind: layer.kind,
    symbolNum: layer.symbolNum,
    symbolType: layer.symbolType,
    children: layer.children?.map((child) => ({
      id: child.id,
      groupId: child.groupId,
      name: child.name,
      visible: child.visible,
      locked: child.locked,
      objectCount: child.objectCount,
      kind: child.kind,
      symbolNum: child.symbolNum,
      symbolType: child.symbolType,
      drawOrder: child.drawOrder,
    })),
  }));
}
