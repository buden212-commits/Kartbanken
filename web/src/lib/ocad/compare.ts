import { compareOcadObjects } from "./diff";
import { parseOcadFile } from "./read";
import type { OcadDiffOptions, OcadDiffResult } from "./diff-types";

export async function compareOcadFiles(
  filePathA: string,
  filePathB: string,
  options?: OcadDiffOptions,
): Promise<OcadDiffResult> {
  const [summaryA, summaryB] = await Promise.all([
    parseOcadFile(filePathA),
    parseOcadFile(filePathB),
  ]);

  return compareOcadObjects(
    summaryA.objects,
    summaryB.objects,
    {
      fileNameA: summaryA.fileName,
      fileNameB: summaryB.fileName,
    },
    options,
  );
}

export { compareOcadObjects } from "./diff";
export type { OcadDiffResult, OcadObjectChange, SymbolDiffSummary } from "./diff-types";
