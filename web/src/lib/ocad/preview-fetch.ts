const previewCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

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
    inflight.delete(url);
    return;
  }
  previewCache.clear();
  inflight.clear();
}

function abortError(): Error {
  return toLoadError(new DOMException("Aborted", "AbortError"));
}

async function fetchPreviewFromNetwork(url: string): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }

    try {
      const response = await fetch(url, { credentials: "same-origin" });
      if (!response.ok) {
        throw new Error(`Kunde inte ladda kartbild (${response.status})`);
      }
      const text = await response.text();
      previewCache.set(url, text);
      return text;
    } catch (err) {
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

  if (!options?.bypassCache) {
    const cached = previewCache.get(url);
    if (cached) return cached;
  }

  let pending = inflight.get(url);
  if (!pending) {
    pending = fetchPreviewFromNetwork(url).finally(() => {
      inflight.delete(url);
    });
    inflight.set(url, pending);
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
