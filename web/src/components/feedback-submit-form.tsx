"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FeedbackType } from "@/lib/feedback/types";

type Props = {
  type: typeof FeedbackType.BUG | typeof FeedbackType.IMPROVEMENT;
  onCreated?: () => void;
};

export function FeedbackSubmitForm({ type, onCreated }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [stepsToReproduce, setStepsToReproduce] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        title,
        description,
        stepsToReproduce: type === FeedbackType.BUG ? stepsToReproduce : undefined,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Kunde inte skicka");
      return;
    }

    setTitle("");
    setDescription("");
    setStepsToReproduce("");
    onCreated?.();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <h2 className="text-lg font-medium text-slate-900">
        {type === FeedbackType.BUG ? "Skicka in bugg" : "Föreslå förbättring"}
      </h2>

      <div>
        <label htmlFor="feedback-title" className="form-label">
          Titel *
        </label>
        <input
          id="feedback-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="form-input"
          placeholder={
            type === FeedbackType.BUG
              ? "t.ex. Export till PDF misslyckas"
              : "t.ex. Visa banlängd i meter per kontroll"
          }
        />
      </div>

      <div>
        <label htmlFor="feedback-description" className="form-label">
          Beskrivning *
        </label>
        <textarea
          id="feedback-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          rows={4}
          className="form-input"
          placeholder={
            type === FeedbackType.BUG
              ? "Vad hände? Vad förväntade du dig?"
              : "Beskriv förbättringen och varför den hjälper klubben."
          }
        />
      </div>

      {type === FeedbackType.BUG && (
        <div>
          <label htmlFor="feedback-steps" className="form-label">
            Steg för att återskapa
          </label>
          <textarea
            id="feedback-steps"
            value={stepsToReproduce}
            onChange={(e) => setStepsToReproduce(e.target.value)}
            rows={3}
            className="form-input"
            placeholder={"1. Öppna …\n2. Klicka …\n3. Felet visas"}
          />
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <button type="submit" disabled={loading} className="btn-primary">
        {loading ? "Skickar…" : "Skicka in"}
      </button>
    </form>
  );
}
