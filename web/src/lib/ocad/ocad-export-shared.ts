export const OCAD_EXPORT_VERSIONS = [
  { value: 18, label: "OCAD 2018" },
  { value: 12, label: "OCAD 12" },
  { value: 11, label: "OCAD 11" },
  { value: 10, label: "OCAD 10" },
] as const;

export type OcadExportVersion = (typeof OCAD_EXPORT_VERSIONS)[number]["value"];

export type CropBbox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CropOcadOptions = {
  bbox: CropBbox;
  targetVersion: OcadExportVersion;
};

export type CropOcadResult = {
  buffer: Buffer;
  sourceVersion: number;
  targetVersion: number;
  keptObjects: number;
  removedObjects: number;
  versionWarning?: string;
};

export type SvgExportFrame = {
  centerX: number;
  centerY: number;
  widthUnits: number;
  heightUnits: number;
};

/** Convert export frame from SVG viewBox space to OCAD native coordinates. */
export function svgExportFrameToGeoBbox(
  frame: SvgExportFrame,
  ocadBounds: [number, number, number, number],
): CropBbox {
  const flipY = ocadBounds[1] + ocadBounds[3];
  const svgX = frame.centerX - frame.widthUnits / 2;
  const svgY = frame.centerY - frame.heightUnits / 2;

  return {
    x: svgX,
    y: flipY - (svgY + frame.heightUnits),
    width: frame.widthUnits,
    height: frame.heightUnits,
  };
}

export function normalizeSourceVersion(version: number): number {
  if (version === 2018) return 18;
  return version;
}

export function defaultOcadExportVersion(
  sourceVersion: number | null | undefined,
): OcadExportVersion {
  const normalized = sourceVersion != null ? normalizeSourceVersion(sourceVersion) : 12;
  if (normalized === 18) return 18;
  if (normalized === 11) return 11;
  if (normalized === 10) return 10;
  return 12;
}

export function buildVersionWarning(
  sourceVersion: number,
  targetVersion: number,
): string | undefined {
  if (sourceVersion === targetVersion) return undefined;

  const sourceUsesV12Format = sourceVersion === 12 || sourceVersion === 18;
  const targetUsesV12Format = targetVersion === 12 || targetVersion === 18;

  if (sourceUsesV12Format && !targetUsesV12Format) {
    return `${versionLabel(targetVersion)} har ett äldre objektformat än källfilen (${versionLabel(sourceVersion)}). Kontrollera filen i OCAD/Mapper efter export.`;
  }

  if (targetVersion > sourceVersion) {
    return `Filen sparades som ${versionLabel(targetVersion)} men källfilen är ${versionLabel(sourceVersion)}.`;
  }

  return `Filen sparades som ${versionLabel(targetVersion)} från källversion ${versionLabel(sourceVersion)}.`;
}

export function versionLabel(version: number): string {
  if (version === 18) return "OCAD 2018";
  return `OCAD ${version}`;
}

export function ocadExportVersionLabel(version: OcadExportVersion): string {
  return OCAD_EXPORT_VERSIONS.find((entry) => entry.value === version)?.label ?? versionLabel(version);
}

export function parseOcadExportVersion(value: unknown): OcadExportVersion | null {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return null;
  return OCAD_EXPORT_VERSIONS.some((entry) => entry.value === numeric)
    ? (numeric as OcadExportVersion)
    : null;
}
