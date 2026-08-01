"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  mapSlug: string;
};

export function UploadVersionForm({ mapSlug }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setWarning(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const file = form.get("file");

    if (!(file instanceof File) || file.size === 0) {
      setError("Välj en .ocd-fil");
      setLoading(false);
      return;
    }

    const uploadData = new FormData();
    uploadData.set("file", file);
    const comment = form.get("comment")?.toString().trim();
    if (comment) uploadData.set("comment", comment);

    const res = await fetch(`/api/maps/${mapSlug}/versions`, {
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
    if (result.duplicateOfPrevious) {
      setWarning("Filen har identiskt innehåll som föregående version.");
    }

    (e.target as HTMLFormElement).reset();

    if (result.previousVersionId) {
      router.push(
        `/maps/${mapSlug}/compare?v1=${result.previousVersionId}&v2=${result.id}`,
      );
    } else {
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="file" className="form-label">
          OCAD-fil (.ocd) *
        </label>
        <input
          id="file"
          name="file"
          type="file"
          accept=".ocd"
          required
          className="form-file"
        />
      </div>
      <div>
        <label htmlFor="comment" className="form-label">
          Kommentar
        </label>
        <input
          id="comment"
          name="comment"
          type="text"
          placeholder="t.ex. Justerat stigar vid sjön"
          className="form-input"
        />
      </div>
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {warning && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {warning}
        </p>
      )}
      <button
        type="submit"
        disabled={loading}
        className="btn-primary"
      >
        {loading ? "Laddar upp…" : "Ladda upp ny version"}
      </button>
    </form>
  );
}
