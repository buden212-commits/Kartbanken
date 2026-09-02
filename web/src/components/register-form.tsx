"use client";

import { useState } from "react";
import { registerUser, type RegisterResult } from "@/lib/auth/register";

const errorMessages: Record<Exclude<RegisterResult, { ok: true }>["error"], string> = {
  duplicate_email: "Det finns redan ett konto med den här e-postadressen.",
  password_mismatch: "Lösenorden matchar inte.",
  password_too_short: "Lösenordet måste vara minst 8 tecken.",
  invalid_email: "Ange en giltig e-postadress.",
  missing_name: "Ange ditt namn.",
  rate_limited: "För många registreringsförsök. Försök igen senare.",
};

export function RegisterForm() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const result = await registerUser(form);

    setLoading(false);

    if (result.ok) {
      setSuccess(true);
      e.currentTarget.reset();
      return;
    }

    setError(errorMessages[result.error]);
  }

  if (success) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        <p className="font-medium">Kontot har skapats</p>
        <p className="mt-1">
          En administratör måste godkänna ditt konto innan du kan logga in. Du får besked när
          åtkomst beviljats.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="register-name" className="form-label">
          Namn
        </label>
        <input
          id="register-name"
          name="name"
          type="text"
          required
          autoComplete="name"
          className="form-input"
        />
      </div>
      <div>
        <label htmlFor="register-email" className="form-label">
          E-post
        </label>
        <input
          id="register-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="form-input"
        />
      </div>
      <div>
        <label htmlFor="register-password" className="form-label">
          Lösenord <span className="font-normal text-slate-500">(minst 8 tecken)</span>
        </label>
        <input
          id="register-password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="form-input"
        />
      </div>
      <div>
        <label htmlFor="register-confirm-password" className="form-label">
          Bekräfta lösenord
        </label>
        <input
          id="register-confirm-password"
          name="confirmPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="form-input"
        />
      </div>
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      <button type="submit" disabled={loading} className="btn-primary w-full py-3">
        {loading ? "Skapar konto…" : "Skapa konto"}
      </button>
    </form>
  );
}
