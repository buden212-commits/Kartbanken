export const VERSION_DIFF_STALE_MS = 8 * 60 * 1000;
/** Heartbeat under långa steg så poll inte tror att jobbet dött. */
export const VERSION_DIFF_HEARTBEAT_MS = 20_000;
/**
 * Om I/O-steg (kö, förbered, spara) inte fått uppdatering på så här länge
 * antas after()-jobbet ha dött — starta om. CPU-steg (parsa/diff) använder
 * VERSION_DIFF_STALE_MS eftersom ocadToGeoJson blockerar event loop.
 */
export const VERSION_DIFF_SOFT_STALE_MS = 75_000;

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
  "parse_objects",
  "compute_diff",
  "save",
];

/** Steg där hjärtslag förväntas (I/O / DB). */
const SOFT_STALE_STEPS = new Set<VersionDiffProgressStep>([
  "queued",
  "parse_versions",
  "load_files",
  "save",
  "layers",
]);

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
      // Äldre jobb — visas som del av parsning
      return "Laddar och parsar";
    case "parse_objects":
      return "Laddar och parsar";
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
  const normalized = step === "load_files" ? "parse_objects" : step;
  const index = VERSION_DIFF_STEPS.indexOf(normalized);
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

/** true om bakgrundsjobbet troligen dött och bör startas om. */
export function isVersionDiffProgressStale(
  progress: VersionDiffProgress | null | undefined,
  status: string | null | undefined,
): boolean {
  if (status !== "PROCESSING" && status !== "PENDING") return false;
  if (!progress?.updatedAt) return true;
  const ageMs = Date.now() - new Date(progress.updatedAt).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return true;
  const downloading =
    progress.step === "parse_objects" &&
    Boolean(progress.detail?.startsWith("Hämtar"));
  if (SOFT_STALE_STEPS.has(progress.step) || downloading) {
    return ageMs >= VERSION_DIFF_SOFT_STALE_MS;
  }
  return ageMs >= VERSION_DIFF_STALE_MS;
}
