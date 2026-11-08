"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { getLoginBlockReason } from "@/lib/auth/login-status";
import { safeCallbackPath } from "@/lib/security/safe-callback-url";

type LoginView = "login" | "forgot";

function googleLoginErrorMessage(code: string | null): string | null {
  switch (code) {
    case "NotClubMember":
      return "E-posten eller namnet matchar ingen klubbmedlem i Eventor. Använd samma e-post som i Eventor, eller skapa ett konto som administratören godkänner.";
    case "AmbiguousName":
      return "Flera medlemmar har samma namn. Logga in med den e-postadress som står i Eventor.";
    case "EventorUnavailable":
      return "Kunde inte kontrollera medlemskap i Eventor. Försök igen om en stund.";
    case "Rejected":
      return "Ditt konto har avvisats. Kontakta administratören om du tror att detta är fel.";
    case "UnverifiedEmail":
      return "Google-kontot har ingen verifierad e-postadress.";
    case "RateLimited":
      return "För många inloggningsförsök. Vänta en stund och försök igen.";
    case null:
      return null;
    default:
      return "Google-inloggningen misslyckades. Försök igen.";
  }
}

export function LoginForm({ googleEnabled = false }: { googleEnabled?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [view, setView] = useState<LoginView>("login");
  const [error, setError] = useState<string | null>(() =>
    googleLoginErrorMessage(searchParams.get("error")),
  );
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

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

    const callbackUrl = safeCallbackPath(searchParams.get("callbackUrl"));
    router.push(callbackUrl);
    router.refresh();
  }

  const callbackUrl = safeCallbackPath(searchParams.get("callbackUrl"));

  return (
    <div className="space-y-4">
      {googleEnabled && (
        <>
          <button
            type="button"
            disabled={googleLoading || loading}
            onClick={() => {
              setError(null);
              setGoogleLoading(true);
              void signIn("google", { callbackUrl });
            }}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <GoogleMark />
            {googleLoading ? "Öppnar Google…" : "Logga in med Google"}
          </button>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />
            eller med e-post
            <span className="h-px flex-1 bg-slate-200" />
          </div>
        </>
      )}
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
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
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
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}
