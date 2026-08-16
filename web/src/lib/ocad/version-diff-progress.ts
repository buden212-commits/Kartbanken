export const VERSION_DIFF_STALE_MS = 8 * 60 * 1000;
/** Heartbeat under långa steg så poll inte tror att jobbet dött. */
export const VERSION_DIFF_HEARTBEAT_MS = 25_000;

export type VersionDiffProgressStep =
  | "queued"
  | "parse_versions"
  | "load_files"
  | "parse_objects"
  | "compute_diff"
  | "save"
  | "layers";

export const VERSION_DIFF_STEPS: VersionDiffProgressStep[] = [
  "queued",
  "parse_versions",
  "load_files",
  "parse_objects",
  "compute_diff",
  "save",
];

export type VersionDiffProgress = {
  step: VersionDiffProgressStep;
  label: string;
  detail?: string;
  updatedAt: string;
  startedAt?: string;
  /** Unikt id för körningen — äldre jobb avbryts om id inte matchar. */
  runId?: string;
  stepIndex?: number;
  stepCount?: number;
};

export function versionDiffStepLabel(step: VersionDiffProgressStep): string {
  switch (step) {
    case "queued":
      return "Köad";
    case "parse_versions":
      return "Förbereder versioner";
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

export function versionDiffStepIndex(step: VersionDiffProgressStep): number {
  const index = VERSION_DIFF_STEPS.indexOf(step);
  return index >= 0 ? index + 1 : VERSION_DIFF_STEPS.length;
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
