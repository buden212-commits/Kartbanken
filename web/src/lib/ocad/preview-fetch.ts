const previewCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

const RETRY_DELAYS_MS = [0, 750, 2000];

class PreviewHttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "PreviewHttpError";
    this.status = status;
  }
}

function toLoadError(err: unknown): Error {
  if (err instanceof DOMException && err.name === "AbortError") {
    return new Error("Laddning avbröts");
  }
  if (err instanceof TypeError && err.message === "Failed to fetch") {
    return new Error(
      "Kunde inte nå servern. Stora kartfiler kan ta tid — försök igen om en stund.",
    );
  }
  if (err instanceof Error) return err;
  return new Error("Kunde inte ladda kartbild");
}

/** Normalize so `…/preview` and `…/preview?direct=1` share cache/inflight. */
export function previewCacheKey(url: string): string {
  try {
    const parsed = new URL(
      url,
      typeof window !== "undefined" ? window.location.origin : "http://localhost",
    );
    parsed.searchParams.delete("direct");
    const search = parsed.searchParams.toString();
    return search ? `${parsed.pathname}?${search}` : parsed.pathname;
  } catch {
    return url.replace(/([?&])direct=1(&|$)/, "$1").replace(/[?&]$/, "");
  }
}

export function clearPreviewCache(url?: string): void {
  if (url) {
    const key = previewCacheKey(url);
    previewCache.delete(key);
    inflight.delete(key);
    // Also drop the raw key if an older caller stored it un-normalized.
    previewCache.delete(url);
    inflight.delete(url);
    return;
  }
  previewCache.clear();
  inflight.clear();
}

function abortError(): Error {
  return toLoadError(new DOMException("Aborted", "AbortError"));
}

function withDirectParam(url: string): string {
  const parsed = new URL(
    url,
    typeof window !== "undefined" ? window.location.origin : "http://localhost",
  );
  parsed.searchParams.set("direct", "1");
  return `${parsed.pathname}${parsed.search}`;
}

async function readSvgBody(response: Response, signal?: AbortSignal): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const payload = (await response.json()) as { url?: string; error?: string };
    if (!payload.url) {
      throw new PreviewHttpError(
        payload.error ?? "Kartbilden saknar nedladdningsadress",
        response.status,
      );
    }
    const direct = await fetch(payload.url, { signal });
    if (!direct.ok) {
      throw new PreviewHttpError(`Kunde inte ladda kartbild (${direct.status})`, direct.status);
    }
    return direct.text();
  }
  return response.text();
}

async function fetchPreviewFromNetwork(
  url: string,
  signal?: AbortSignal,
): Promise<string> {
  let lastError: unknown;
  const requestUrl = withDirectParam(url);

  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
    if (signal?.aborted) throw abortError();
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }

    try {
      const response = await fetch(requestUrl, {
        credentials: "same-origin",
        signal,
        headers: {
          Accept: "application/json, image/svg+xml, text/plain;q=0.9,*/*;q=0.8",
        },
      });
      if (!response.ok) {
        const serverMessage = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new PreviewHttpError(
          serverMessage?.error ?? `Kunde inte ladda kartbild (${response.status})`,
          response.status,
        );
      }
      return await readSvgBody(response, signal);
    } catch (err) {
      if (signal?.aborted) throw abortError();
      // HTTP-fel (404/500) ska inte retrys:s — det förlänger bara en gateway-timeout.
      if (err instanceof PreviewHttpError) throw err;
      lastError = err;
    }
  }

  throw toLoadError(lastError);
}

export async function fetchPreviewText(
  url: string,
  options?: { signal?: AbortSignal; bypassCache?: boolean },
): Promise<string> {
  if (options?.signal?.aborted) {
    throw abortError();
  }

  const key = previewCacheKey(url);

  if (!options?.bypassCache) {
    const cached = previewCache.get(key);
    if (cached) return cached;
  }

  let pending = inflight.get(key);
  if (!pending) {
    // Shared network fetch must NOT use a caller AbortSignal. In React Strict Mode
    // (and remounts), the first effect aborts on cleanup; if that signal is tied to
    // the shared request, the remounted effect joins the same promise and surfaces
    // "Laddning avbröts" even though its own signal is still live.
    pending = fetchPreviewFromNetwork(url)
      .then((text) => {
        previewCache.set(key, text);
        return text;
      })
      .finally(() => {
        inflight.delete(key);
      });
    inflight.set(key, pending);
  }

  if (!options?.signal) {
    return pending;
  }

  return new Promise<string>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    options.signal!.addEventListener("abort", onAbort, { once: true });
    pending!
      .then((text) => {
        options.signal!.removeEventListener("abort", onAbort);
        if (options.signal!.aborted) {
          reject(abortError());
          return;
        }
        resolve(text);
      })
      .catch((err) => {
        options.signal!.removeEventListener("abort", onAbort);
        reject(err);
      });
  });
}
