"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

type Props = {
  requireCurrentPassword: boolean;
  submitLabel?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
};

export function ChangePasswordForm({
  requireCurrentPassword,
  submitLabel = "Spara nytt lösenord",
  onSuccess,
  onCancel,
}: Props) {
  const router = useRouter();
  const { update } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const currentPassword = form.get("currentPassword")?.toString() ?? "";
    const newPassword = form.get("newPassword")?.toString() ?? "";
    const confirmPassword = form.get("confirmPassword")?.toString() ?? "";

    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: requireCurrentPassword ? currentPassword : undefined,
          newPassword,
          confirmPassword,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Kunde inte byta lösenord");
      }

      await update();
      onSuccess?.();
      router.refresh();
      if (!onSuccess) {
        router.push("/");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte byta lösenord");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
      {requireCurrentPassword && (
        <div>
          <label htmlFor="currentPassword" className="form-label">
            Nuvarande lösenord
          </label>
          <input
            id="currentPassword"
            name="currentPassword"
            type="password"
            required
            autoComplete="current-password"
            className="form-input"
          />
        </div>
      )}
      <div>
        <label htmlFor="newPassword" className="form-label">
          Nytt lösenord
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="form-input"
        />
      </div>
      <div>
        <label htmlFor="confirmPassword" className="form-label">
          Bekräfta nytt lösenord
        </label>
        <input
          id="confirmPassword"
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
      <div className={`flex ${onCancel ? "justify-end gap-2" : ""}`}>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Avbryt
          </button>
        )}
        <button type="submit" disabled={loading} className="btn-primary px-4 py-2">
          {loading ? "Sparar…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
