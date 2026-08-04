"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CreateMapForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const title = form.get("title")?.toString().trim();
    const description = form.get("description")?.toString().trim() || undefined;

    if (!title) {
      setError("Titel krävs");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/maps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Kunde inte skapa område");
      return;
    }

    const map = await res.json();
    router.push(`/maps/${map.slug}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor="title" className="form-label">
          Område *
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          placeholder="t.ex. Mora Väst med Venjan"
          className="form-input"
        />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="description" className="form-label">
          Beskrivning
        </label>
        <textarea
          id="description"
          name="description"
          rows={2}
          className="form-input"
        />
      </div>
      {error && (
        <p className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={loading}
          className="btn-primary"
        >
          {loading ? "Skapar…" : "Skapa område"}
        </button>
      </div>
    </form>
  );
}
