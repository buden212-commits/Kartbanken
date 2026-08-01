"use client";

import { useState } from "react";

type Props = {
  onJobCreated: (jobId: string) => void;
};

export function VerifyCompareForm({ onJobCreated }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const fileA = form.get("fileA");
    const fileB = form.get("fileB");

    if (!(fileA instanceof File) || fileA.size === 0) {
      setError("Välj äldre OCAD-fil (fil A)");
      setLoading(false);
      return;
    }
    if (!(fileB instanceof File) || fileB.size === 0) {
      setError("Välj nyare OCAD-fil (fil B)");
      setLoading(false);
      return;
    }

    const uploadData = new FormData();
    uploadData.set("fileA", fileA);
    uploadData.set("fileB", fileB);

    const res = await fetch("/api/verify/compare", {
      method: "POST",
      body: uploadData,
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Uppladdning misslyckades");
      return;
    }

    const result = await res.json();
    onJobCreated(result.jobId as string);
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="fileA" className="form-label">
            Fil A — äldre version *
          </label>
          <input
            id="fileA"
            name="fileA"
            type="file"
            accept=".ocd"
            required
            className="form-file"
          />
          <p className="mt-1 text-xs text-slate-500">Befintlig kartfil att jämföra mot.</p>
        </div>
        <div>
          <label htmlFor="fileB" className="form-label">
            Fil B — nyare version *
          </label>
          <input
            id="fileB"
            name="fileB"
            type="file"
            accept=".ocd"
            required
            className="form-file"
          />
          <p className="mt-1 text-xs text-slate-500">Filen du vill verifiera innan uppladdning.</p>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <button type="submit" disabled={loading} className="btn-primary">
        {loading ? "Laddar upp och startar jämförelse…" : "Jämför filer"}
      </button>
    </form>
  );
}
