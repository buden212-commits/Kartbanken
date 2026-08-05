"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { getLoginBlockReason } from "@/lib/auth/login-status";

type LoginView = "login" | "forgot";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [view, setView] = useState<LoginView>("login");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (view === "forgot") {
    return <ForgotPasswordForm onBack={() => setView("login")} />;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const email = form.get("email")?.toString() ?? "";
    const password = form.get("password")?.toString() ?? "";

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      const blockReason = await getLoginBlockReason(email, password);
      if (blockReason === "pending") {
        setError("Ditt konto väntar på godkännande av administratör.");
      } else if (blockReason === "rejected") {
        setError("Ditt konto har avvisats. Kontakta administratören om du tror att detta är fel.");
      } else if (blockReason === "expired_temp_password") {
        setError(
          "Det tillfälliga lösenordet har gått ut. Begär ett nytt under «Glömt lösenord?».",
        );
      } else {
        setError("Fel e-post eller lösenord.");
      }
      return;
    }

    const callbackUrl = searchParams.get("callbackUrl") ?? "/";
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="form-label">
          E-post
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="form-input"
        />
      </div>
      <div>
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="password" className="form-label">
            Lösenord
          </label>
          <button
            type="button"
            onClick={() => setView("forgot")}
            className="text-xs font-medium text-ifk-blue hover:text-ifk-blue-hover"
          >
            Glömt lösenord?
          </button>
        </div>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="form-input mt-1"
        />
      </div>
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={loading}
        className="btn-primary w-full py-3"
      >
        {loading ? "Loggar in…" : "Logga in"}
      </button>
    </form>
  );
}
