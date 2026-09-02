export type IntegrationStep =
  | "start"
  | "resolve_diff"
  | "load_files"
  | "apply_changes"
  | "validate_output"
  | "upload"
  | "persist"
  | "post_process";

export class IntegrationError extends Error {
  readonly step: IntegrationStep;
  readonly hint?: string;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    options: {
      step: IntegrationStep;
      hint?: string;
      details?: Record<string, unknown>;
      cause?: unknown;
    },
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "IntegrationError";
    this.step = options.step;
    this.hint = options.hint;
    this.details = options.details;
  }
}

export function integrationStepLabel(step: IntegrationStep): string {
  switch (step) {
    case "start":
      return "Start";
    case "resolve_diff":
      return "Läsa/beräkna diff";
    case "load_files":
      return "Ladda kartfiler";
    case "apply_changes":
      return "Applicera ändringar i OCAD";
    case "validate_output":
      return "Validera sammanslagen fil";
    case "upload":
      return "Ladda upp ny version";
    case "persist":
      return "Spara version och status";
    case "post_process":
      return "Efterbearbetning (kartbild/diff)";
    default:
      return step;
  }
}

export function toIntegrationError(
  err: unknown,
  step: IntegrationStep,
  fallback: string,
  extra?: { hint?: string; details?: Record<string, unknown> },
): IntegrationError {
  if (err instanceof IntegrationError) {
    return err;
  }
  const message =
    err instanceof Error && err.message.trim() ? err.message : fallback;
  return new IntegrationError(message, {
    step,
    hint: extra?.hint,
    details: {
      ...(extra?.details ?? {}),
      ...(err instanceof Error && err.name ? { errorName: err.name } : {}),
    },
    cause: err,
  });
}
