export type CompareProcessingStage = "parse" | "diff" | "layers";

export type CompareProcessingProgress = {
  stage: CompareProcessingStage;
  /** Versionsnummer som parsas just nu, när det är känt. */
  parsingVersionNumber: number | null;
};

type VersionProgressInput = {
  versionNumber: number;
  parseStatus: string;
};

export function deriveCompareProcessingProgress(
  versionA: VersionProgressInput,
  versionB: VersionProgressInput,
  diffStage?: CompareProcessingStage | null,
): CompareProcessingProgress {
  if (diffStage === "diff" || diffStage === "layers") {
    return { stage: diffStage, parsingVersionNumber: null };
  }

  if (versionB.parseStatus !== "OK") {
    return { stage: "parse", parsingVersionNumber: versionB.versionNumber };
  }

  if (versionA.parseStatus !== "OK") {
    return { stage: "parse", parsingVersionNumber: versionA.versionNumber };
  }

  return { stage: "parse", parsingVersionNumber: null };
}

export function compareProcessingStageMessage(progress: CompareProcessingProgress): string {
  if (progress.stage === "layers") {
    return "Skapar kartlager…";
  }

  if (progress.stage === "diff") {
    return "Beräknar skillnader…";
  }

  if (progress.parsingVersionNumber != null) {
    return `Läser kartfil v${progress.parsingVersionNumber}…`;
  }

  return "Läser kartfiler…";
}
