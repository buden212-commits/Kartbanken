import { Suspense } from "react";
import { AuthTabs } from "@/components/auth-tabs";

export default function LoginPage() {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center px-6">
      <main className="card w-full max-w-md">
        <p className="page-eyebrow">IFK Mora OK</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Välkommen</h1>
        <p className="mt-3 text-sm text-slate-600">
          Logga in med ditt konto, eller skapa ett nytt konto som godkänns av administratören.
        </p>

        <div className="mt-8">
          <Suspense fallback={<p className="text-sm text-slate-500">Laddar…</p>}>
            <AuthTabs />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
