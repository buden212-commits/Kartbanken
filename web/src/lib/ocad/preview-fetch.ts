const previewCache = new Map<string, string>();

const RETRY_DELAYS_MS = [0, 750, 2000];

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

export function clearPreviewCache(url?: string): void {
  if (url) {
    previewCache.delete(url);
    return;
  }
  previewCache.clear();
}

export async function fetchPreviewText(
  url: string,
  options?: { signal?: AbortSignal; bypassCache?: boolean },
): Promise<string> {
  if (!options?.bypassCache) {
    const cached = previewCache.get(url);
    if (cached) return cached;
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }

    try {
      const response = await fetch(url, {
        signal: options?.signal,
        credentials: "same-origin",
      });

      if (!response.ok) {
        throw new Error(`Kunde inte ladda kartbild (${response.status})`);
      }

      const text = await response.text();
      previewCache.set(url, text);
      return text;
    } catch (err) {
      if (options?.signal?.aborted) {
        throw toLoadError(err);
      }
      lastError = err;
    }
  }

  throw toLoadError(lastError);
}
