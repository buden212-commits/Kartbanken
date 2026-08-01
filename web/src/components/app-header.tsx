import Link from "next/link";
import { auth, signOut } from "@/auth";
import { roleLabel } from "@/lib/auth/permissions";
import { canAdmin } from "@/lib/auth/permissions";

export async function AppHeader() {
  const session = await auth();

  return (
    <header className="border-b border-ifk-blue bg-ifk-blue text-white shadow-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
        <Link href="/" className="flex items-center gap-3">
          <span className="text-base font-semibold tracking-tight">kartor.ifkmora.se</span>
          <span className="hidden text-xs font-medium uppercase tracking-wider text-white/60 sm:inline">
            IFK Mora OK
          </span>
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {session?.user && (
            <>
              <Link href="/" className="text-white/80 transition hover:text-white">
                Kartfiler
              </Link>
              <Link href="/verifiera" className="text-white/80 transition hover:text-white">
                Verifiera
              </Link>
              {canAdmin(session.user.role) && (
                <Link href="/admin/users" className="text-white/80 transition hover:text-white">
                  Admin
                </Link>
              )}
              <span className="hidden text-white/50 sm:inline">
                {session.user.email} · {roleLabel(session.user.role)}
              </span>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/login" });
                }}
              >
                <button
                  type="submit"
                  className="rounded-md border border-white/25 px-3 py-1.5 text-white/90 transition hover:bg-white/10"
                >
                  Logga ut
                </button>
              </form>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
