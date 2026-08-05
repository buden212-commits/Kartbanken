"use client";

import { useState } from "react";
import { FORGOT_PASSWORD_SUCCESS_MESSAGE } from "@/lib/auth/password-policy";

type Props = {
  onBack: () => void;
};

export function ForgotPasswordForm({ onBack }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    setLoading(true);

    const email = new FormData(event.currentTarget).get("email")?.toString() ?? "";

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Kunde inte skicka återställningsmail");
      }
      setMessage(data.message ?? FORGOT_PASSWORD_SUCCESS_MESSAGE);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte skicka återställningsmail");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Ange din e-postadress. Om den finns registrerad skickas ett tillfälligt lösenord som
        gäller i en timme.
      </p>
      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
        <div>
          <label htmlFor="reset-email" className="form-label">
            E-post
          </label>
          <input
            id="reset-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="form-input"
          />
        </div>
        {message && (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {message}
          </p>
        )}
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? "Skickar…" : "Skicka tillfälligt lösenord"}
          </button>
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Tillbaka till inloggning
          </button>
        </div>
      </form>
    </div>
  );
}
