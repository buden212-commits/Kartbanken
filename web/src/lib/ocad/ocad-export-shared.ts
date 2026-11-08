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
  /** Tillåt tom crop (alla objekt soft-delete). Används vid import av delkarta i tomt område. */
  allowEmpty?: boolean;
  /** When set, exactly these object indices are kept (bbox is ignored for the predicate). */
  keepObjectIndices?: Set<number>;
};

export type CropOcadResult = {
  buffer: Buffer;
  sourceVersion: number;
  targetVersion: number;
  keptObjects: number;
  removedObjects: number;
  /** Object index values kept by the binary crop (same numbering as GeoJSON objectIndex). */
  keptObjectIndices: number[];
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

/** Value written to the OCAD file header (OCAD itself stores 2018, not 18). */
export function ocadHeaderVersionValue(version: number): number {
  return normalizeSourceVersion(version) === 18 ? 2018 : version;
}

/** OCAD object record layout: 10, 11 and 12 (12 and 2018 share format). */
function exportObjectFormat(version: number): number {
  const normalized = normalizeSourceVersion(version);
  return normalized === 18 ? 12 : normalized;
}

/**
 * Only the header is rewritten on export, so the target must share the source's
 * object record layout — otherwise the file is unreadable.
 */
export function isCompatibleExportVersion(sourceVersion: number, targetVersion: number): boolean {
  return exportObjectFormat(sourceVersion) === exportObjectFormat(targetVersion);
}

export function compatibleOcadExportVersions(
  sourceVersion: number | null | undefined,
): (typeof OCAD_EXPORT_VERSIONS)[number][] {
  if (sourceVersion == null) return [...OCAD_EXPORT_VERSIONS];
  return OCAD_EXPORT_VERSIONS.filter((entry) =>
    isCompatibleExportVersion(sourceVersion, entry.value),
  );
}

export function incompatibleExportVersionMessage(
  sourceVersion: number,
  targetVersion: number,
): string {
  return `Kan inte spara ${versionLabel(normalizeSourceVersion(sourceVersion))} som ${versionLabel(targetVersion)} — objektformatet skiljer sig. Välj samma OCAD-version som källfilen (eller öppna och spara om filen i OCAD).`;
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
