import Image from "next/image";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import { AppHeaderUserMenu } from "@/components/app-header-user-menu";
import { canAdmin } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/roles";

export async function AppHeader() {
  const session = await auth();
  const profile = session?.user?.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          name: true,
          email: true,
          receiveNotifications: true,
          receiveOcdAttachment: true,
        },
      })
    : null;

  return (
    <header className="border-b border-ifk-blue bg-ifk-blue text-white shadow-sm">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6 sm:py-3.5">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <Image
            src="/ifk-mora-logo.png"
            alt="IFK Mora OK"
            width={33}
            height={36}
            className="h-8 w-auto shrink-0"
            priority
          />
          <span className="truncate text-sm font-semibold tracking-tight sm:text-base">
            kartor.ifkmora.se
          </span>
          <span className="hidden text-xs font-medium uppercase tracking-wider text-white/60 lg:inline">
            IFK Mora OK
          </span>
        </Link>
        <nav className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          {session?.user && (
            <>
              <Link href="/" className="text-white/80 transition hover:text-white">
                Område
              </Link>
              <Link href="/verifiera" className="text-white/80 transition hover:text-white">
                Verifiera
              </Link>
              {canAdmin(session.user.role) && (
                <Link href="/admin/users" className="text-white/80 transition hover:text-white">
                  Admin
                </Link>
              )}
              <Link href="/hjalp" className="text-white/80 transition hover:text-white">
                Hjälp
              </Link>
              <AppHeaderUserMenu
                name={profile?.name ?? session.user.name}
                email={profile?.email ?? session.user.email ?? ""}
                role={session.user.role as Role}
                receiveNotifications={profile?.receiveNotifications ?? false}
                receiveOcdAttachment={profile?.receiveOcdAttachment ?? false}
              />
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/login" });
                }}
              >
                <button
                  type="submit"
                  className="rounded-md border border-white/25 px-2.5 py-1.5 text-xs text-white/90 transition hover:bg-white/10 sm:px-3 sm:text-sm"
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
