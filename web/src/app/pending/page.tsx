import { auth, signOut } from "@/auth";
import { Role } from "@/lib/roles";

export default async function PendingPage() {
  const session = await auth();
  const isRejected = session?.user.role === Role.REJECTED;

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="card max-w-md">
        <h1 className="text-xl font-semibold text-slate-900">
          {isRejected ? "Åtkomst nekad" : "Väntar på godkännande"}
        </h1>
        <p className="mt-3 text-slate-600">
          {isRejected
            ? "Ditt konto har avvisats. Kontakta administratören om du tror att detta är fel."
            : "Ditt konto är registrerat men en administratör måste godkänna dig innan du kan använda tjänsten."}
        </p>
        {session?.user.email && (
          <p className="mt-4 font-mono text-sm text-slate-500">{session.user.email}</p>
        )}
        <form
          className="mt-6"
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button
            type="submit"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Logga ut
          </button>
        </form>
      </div>
    </div>
  );
}
