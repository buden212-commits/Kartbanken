import { Suspense } from "react";
import { AuthTabs } from "@/components/auth-tabs";
import { HelpLinkIcon } from "@/components/help-link-icon";

export default function LoginPage() {
  const googleEnabled = Boolean(
    process.env.AUTH_GOOGLE_ID?.trim() && process.env.AUTH_GOOGLE_SECRET?.trim(),
  );

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center px-6">
      <main className="card w-full max-w-md">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="page-eyebrow">IFK Mora OK</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900">Välkommen</h1>
            <p className="mt-3 text-sm text-slate-600">
              {googleEnabled
                ? "Logga in med Google om du är klubbmedlem, med e-post och lösenord, eller skapa ett nytt konto som godkänns av administratören."
                : "Logga in med ditt konto, eller skapa ett nytt konto som godkänns av administratören."}
            </p>
          </div>
          <HelpLinkIcon section="kom-igang" className="mt-1 shrink-0" />
        </div>

        <div className="mt-8">
          <Suspense fallback={<p className="text-sm text-slate-500">Laddar…</p>}>
            <AuthTabs googleEnabled={googleEnabled} />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
