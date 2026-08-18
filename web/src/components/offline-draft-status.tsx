"use client";

type Props = {
  online: boolean;
  restored?: boolean;
  queued?: boolean;
  lastError?: string | null;
};

export function OfflineDraftStatus({ online, restored, queued, lastError }: Props) {
  if (!restored && !queued && !lastError && online) return null;

  if (!online) {
    return (
      <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        Ingen nätanslutning. Utkast och foto sparas på enheten och skickas automatiskt när du är
        online igen.
      </p>
    );
  }

  if (queued) {
    return (
      <p className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
        Sparat på enheten. Skickas när nätet kommer tillbaka.
      </p>
    );
  }

  if (lastError) {
    return (
      <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
        {lastError}
      </p>
    );
  }

  if (restored) {
    return (
      <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
        Ett osparat utkast återställdes från den här enheten.
      </p>
    );
  }

  return null;
}
