export type ImportPartialProgressStep =
  | "queued"
  | "upload"
  | "load_head"
  | "parse_files"
  | "compare"
  | "overlap"
  | "done";

export type ImportPartialProgress = {
  step: ImportPartialProgressStep;
  label: string;
  detail?: string;
  updatedAt: string;
};

export function importPartialStepLabel(step: ImportPartialProgressStep): string {
  switch (step) {
    case "queued":
      return "Köad";
    case "upload":
      return "Laddar upp delkartan";
    case "load_head":
      return "Läser aktuell kartversion";
    case "parse_files":
      return "Parsar OCAD-filer";
    case "compare":
      return "Bygger polygon och jämför objekt";
    case "overlap":
      return "Kontrollerar överlappande utcheckningar";
    case "done":
      return "Klar";
    default:
      return step;
  }
}

export function makeImportPartialProgress(
  step: ImportPartialProgressStep,
  detail?: string,
): ImportPartialProgress {
  return {
    step,
    label: importPartialStepLabel(step),
    ...(detail ? { detail } : {}),
    updatedAt: new Date().toISOString(),
  };
}
