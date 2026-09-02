export const VERSION_DIFF_STALE_MS = 8 * 60 * 1000;

export type VersionDiffProgressStep =
  | "queued"
  | "parse_versions"
  | "load_files"
  | "parse_objects"
  | "compute_diff"
  | "save"
  | "layers";

export type VersionDiffProgress = {
  step: VersionDiffProgressStep;
  label: string;
  detail?: string;
  updatedAt: string;
  startedAt?: string;
};

export function versionDiffStepLabel(step: VersionDiffProgressStep): string {
  switch (step) {
    case "queued":
      return "Köad";
    case "parse_versions":
      return "Kontrollerar kartversioner";
    case "load_files":
      return "Laddar OCAD-filer";
    case "parse_objects":
      return "Parsar kartobjekt";
    case "compute_diff":
      return "Beräknar skillnader";
    case "save":
      return "Sparar resultat";
    case "layers":
      return "Skapar kartlager";
    default:
      return step;
  }
}

export function parseVersionDiffProgress(
  summaryJson: string | null | undefined,
): VersionDiffProgress | null {
  if (!summaryJson) return null;
  try {
    const parsed = JSON.parse(summaryJson) as { progress?: VersionDiffProgress };
    if (!parsed.progress?.step || !parsed.progress.updatedAt) return null;
    return parsed.progress;
  } catch {
    return null;
  }
}
