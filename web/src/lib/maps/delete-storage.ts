import { deleteFile } from "@/lib/storage";

type LayerPaths = {
  added?: string;
  removed?: string;
  modified?: string;
};

export function collectLayerPathsFromSummary(summaryJson: string | null): string[] {
  if (!summaryJson) return [];
  try {
    const summary = JSON.parse(summaryJson) as { layerPaths?: LayerPaths };
    const paths = summary.layerPaths;
    if (!paths) return [];
    return [paths.added, paths.removed, paths.modified].filter(
      (path): path is string => Boolean(path),
    );
  } catch {
    return [];
  }
}

export async function deleteStoragePaths(paths: Iterable<string | null | undefined>): Promise<void> {
  const unique = [...new Set([...paths].filter((path): path is string => Boolean(path)))];
  await Promise.all(unique.map((path) => deleteFile(path).catch(() => undefined)));
}
