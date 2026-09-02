/** Tillåt endast relativa sökvägar inom appen (förhindrar open redirect). */
export function safeCallbackPath(raw: string | null | undefined, fallback = "/"): string {
  if (!raw) return fallback;
  const value = raw.trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }
  if (value.includes("://")) {
    return fallback;
  }
  return value;
}
