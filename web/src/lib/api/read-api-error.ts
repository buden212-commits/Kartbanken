export type ApiErrorBody = {
  error?: string;
  step?: string;
  stepLabel?: string;
  hint?: string;
  details?: Record<string, unknown>;
};

/**
 * Reads an API response as JSON when possible; otherwise explains HTML/timeout/crash pages.
 */
export async function readApiError(
  res: Response,
  fallback: string,
): Promise<{ message: string; body: ApiErrorBody }> {
  const raw = await res.text();
  let body: ApiErrorBody = {};

  if (raw) {
    try {
      body = JSON.parse(raw) as ApiErrorBody;
    } catch {
      const looksHtml = /^\s*</.test(raw) || raw.includes("<!DOCTYPE");
      const message = looksHtml
        ? `${fallback} (HTTP ${res.status}). Servern svarade med en felsida i stället för JSON — ofta timeout eller slut på minne vid stora kartor. Försök igen; om det upprepas, notera tidpunkt och utchecknings-id.`
        : `${fallback} (HTTP ${res.status}). Servern svarade ogiltigt.`;
      return { message, body: { error: message } };
    }
  }

  const parts: string[] = [];
  if (body.stepLabel || body.step) {
    parts.push(`Steg: ${body.stepLabel ?? body.step}`);
  }
  parts.push(body.error?.trim() || `${fallback} (HTTP ${res.status})`);
  if (body.hint?.trim() && !parts.join(" ").includes(body.hint.trim())) {
    parts.push(body.hint.trim());
  }

  if (body.details && typeof body.details === "object") {
    const detailBits = Object.entries(body.details)
      .filter(([, value]) => value != null && value !== "")
      .slice(0, 8)
      .map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`);
    if (detailBits.length > 0) {
      parts.push(`Detaljer: ${detailBits.join(", ")}`);
    }
  }

  return { message: parts.join("\n"), body };
}
