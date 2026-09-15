export function buildTileManifestPath(mapFileId: string, versionNumber: number): string {
  return `maps/${mapFileId}/v${versionNumber}/tiles/manifest.json`;
}

export function buildTilePath(
  mapFileId: string,
  versionNumber: number,
  z: number,
  x: number,
  y: number,
): string {
  return `maps/${mapFileId}/v${versionNumber}/tiles/${z}/${x}/${y}.webp`;
}
