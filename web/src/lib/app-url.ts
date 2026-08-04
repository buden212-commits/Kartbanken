const LOCALHOST_FALLBACK = "http://localhost:3000";

function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim();
  const withProtocol =
    trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed
      : `https://${trimmed}`;
  return withProtocol.replace(/\/$/, "");
}

function isLocalhostUrl(url: string): boolean {
  try {
    const { hostname } = new URL(normalizeBaseUrl(url));
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

function resolveVercelUrl(): string | null {
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (production) {
    return normalizeBaseUrl(production);
  }

  const deployment = process.env.VERCEL_URL?.trim();
  if (deployment) {
    return normalizeBaseUrl(deployment);
  }

  return null;
}

function resolveConfiguredUrl(raw: string | undefined, onVercel: boolean): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = normalizeBaseUrl(trimmed);
  if (onVercel && isLocalhostUrl(normalized)) {
    return null;
  }

  return normalized;
}

/**
 * Public base URL for links in emails and other server-generated content.
 *
 * Resolution order:
 * 1. NEXT_PUBLIC_APP_URL (skipped on Vercel if set to localhost)
 * 2. AUTH_URL (same localhost guard on Vercel)
 * 3. VERCEL_PROJECT_PRODUCTION_URL or VERCEL_URL (https://…)
 * 4. http://localhost:3000 (local dev)
 *
 * On Vercel production, set NEXT_PUBLIC_APP_URL and AUTH_URL to your public URL
 * (e.g. https://web-ebon-eight-72.vercel.app or a custom domain).
 */
export function getAppBaseUrl(): string {
  const onVercel = process.env.VERCEL === "1";

  const fromEnv =
    resolveConfiguredUrl(process.env.NEXT_PUBLIC_APP_URL, onVercel) ??
    resolveConfiguredUrl(process.env.AUTH_URL, onVercel);

  if (fromEnv) {
    return fromEnv;
  }

  if (onVercel) {
    const vercelUrl = resolveVercelUrl();
    if (vercelUrl) {
      return vercelUrl;
    }
  }

  return LOCALHOST_FALLBACK;
}
