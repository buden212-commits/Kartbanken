import {
  tileBuildProgressFromVersion,
  type TileBuildProgress,
} from "@/lib/ocad/tile-status";

export type CompareProcessingStage = "parse" | "tiles" | "diff";

export type CompareProcessingProgress = {
  stage: CompareProcessingStage;
  parsingVersionNumber: number | null;
  tileProgress: TileBuildProgress | null;
};

type VersionProgressInput = {
  versionNumber: number;
  parseStatus: string;
  tileStatus: string;
  tileBuildTotal: number | null;
  tileBuildDone: number | null;
  tileBuildCurrentZ: number | null;
  tileBuildMaxZPregen: number | null;
};

export function deriveCompareProcessingProgress(
  versionA: VersionProgressInput,
  versionB: VersionProgressInput,
): CompareProcessingProgress {
  if (versionB.parseStatus === "PENDING" || versionB.parseStatus === "PROCESSING") {
    return {
      stage: "parse",
      parsingVersionNumber: versionB.versionNumber,
      tileProgress: null,
    };
  }

  if (versionB.parseStatus !== "OK") {
    return {
      stage: "parse",
      parsingVersionNumber: versionB.versionNumber,
      tileProgress: null,
    };
  }

  if (versionB.tileStatus === "PENDING" || versionB.tileStatus === "PROCESSING") {
    return {
      stage: "tiles",
      parsingVersionNumber: null,
      tileProgress: tileBuildProgressFromVersion(versionB),
    };
  }

  if (versionA.parseStatus === "PENDING" || versionA.parseStatus === "PROCESSING") {
    return {
      stage: "parse",
      parsingVersionNumber: versionA.versionNumber,
      tileProgress: null,
    };
  }

  if (versionA.parseStatus !== "OK") {
    return {
      stage: "parse",
      parsingVersionNumber: versionA.versionNumber,
      tileProgress: null,
    };
  }

  return {
    stage: "diff",
    parsingVersionNumber: null,
    tileProgress: null,
  };
}

export function compareProcessingStageMessage(progress: CompareProcessingProgress): string {
  if (progress.stage === "parse" && progress.parsingVersionNumber != null) {
    return `Parsar kartfil v${progress.parsingVersionNumber}…`;
  }

  if (progress.stage === "tiles") {
    if (progress.tileProgress?.preparing) {
      return "Förbereder kartlager…";
    }
    if (progress.tileProgress) {
      return `Skapar kartlager… ${progress.tileProgress.done} av ${progress.tileProgress.total} rutor`;
    }
    return "Skapar kartlager…";
  }

  return "Beräknar skillnader…";
}
