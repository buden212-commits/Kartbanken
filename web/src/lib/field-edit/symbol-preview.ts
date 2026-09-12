import { createRequire } from "module";
import { markObjectsDeletedByIndices } from "@/lib/ocad/ocad-export-server";
import { appendNewObjects } from "@/lib/ocad/ocad-integrate";
import { generateOcadSvgFiltered } from "@/lib/ocad/svg";
import { extractSvgInner, type SvgBounds } from "@/lib/ocad/svg-utils";
import {
  buildSpecFromAdd,
  buildSpecFromGeometry,
  buildSpecFromModify,
  readOcadFileData,
} from "./build-object-spec";
import {
  allRemovedIndices,
  hasFieldEditChanges,
  type FieldEditGeometryKind,
  type FieldEditOps,
} from "./types";

const require = createRequire(import.meta.url);
const { readOcad } = require("ocad2geojson") as {
  readOcad: (
    input: Buffer,
    options?: { quietWarnings?: boolean },
  ) => Promise<{ getBounds: () => number[] }>;
};

export type FieldEditDraftPreview = {
  kind: FieldEditGeometryKind;
  symbolNumber: number;
  coordinates: [number, number][];
};

export type FieldEditSymbolPreview = {
  svgInner: string;
  maskedIndices: number[];
};

function boundsFromOcadFileSync(ocadFile: { getBounds: () => number[] }): SvgBounds {
  const raw = ocadFile.getBounds();
  if (raw && raw.length >= 4) {
    const [minX, minY, maxX, maxY] = raw;
    return { minX, minY, maxX, maxY };
  }
  return { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
}

function draftIsRenderable(draft: FieldEditDraftPreview | null | undefined): draft is FieldEditDraftPreview {
  if (!draft) return false;
  if (draft.kind === "point") return draft.coordinates.length >= 1;
  if (draft.kind === "line") return draft.coordinates.length >= 2;
  return draft.coordinates.length >= 3;
}

export async function buildFieldEditSymbolPreview(
  subsetBuffer: Buffer,
  ops: FieldEditOps,
  draft?: FieldEditDraftPreview | null,
): Promise<FieldEditSymbolPreview | null> {
  const renderableDraft = draftIsRenderable(draft) ? draft : null;
  if (!hasFieldEditChanges(ops) && !renderableDraft) {
    return null;
  }

  let working = Buffer.from(subsetBuffer);
  const maskedIndices = [...allRemovedIndices(ops)];
  if (maskedIndices.length > 0) {
    markObjectsDeletedByIndices(working, new Set(maskedIndices));
  }

  const specs = [];
  const ocadFile = await readOcadFileData(working);
  for (const modify of ops.modifies) {
    specs.push(buildSpecFromModify(ocadFile, modify));
  }
  for (const add of ops.adds) {
    specs.push(buildSpecFromAdd(ocadFile, add));
  }
  if (renderableDraft) {
    specs.push(
      buildSpecFromGeometry(
        ocadFile,
        renderableDraft.kind,
        renderableDraft.symbolNumber,
        renderableDraft.coordinates,
        "Utkast",
      ),
    );
  }

  if (specs.length === 0) {
    return { svgInner: "", maskedIndices };
  }

  const appendResult = appendNewObjects(working, specs);
  working = Buffer.from(appendResult.buffer);
  const previewIndices = new Set(appendResult.objectIndices);
  const viewBounds = boundsFromOcadFileSync(await readOcad(subsetBuffer, { quietWarnings: true }));
  const svg = await generateOcadSvgFiltered(working, previewIndices, viewBounds);
  const { inner } = extractSvgInner(svg);
  return { svgInner: inner, maskedIndices };
}
