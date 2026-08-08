import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AdminNav } from "@/components/admin-nav";
import { HelpSectionHeading } from "@/components/help-link-icon";
import { canAdmin } from "@/lib/auth/permissions";
import { findPendingAdminCheckouts } from "@/lib/checkout/repository";
import { checkoutStatusLabel, CheckoutStatus } from "@/lib/checkout/types";
import { formatDate } from "@/lib/format";

export default async function AdminCheckoutsPage() {
  const session = await auth();
  if (!session?.user?.role || !canAdmin(session.user.role)) redirect("/");

  const pending = await findPendingAdminCheckouts();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <Link href="/" className="link-muted text-sm">
        ← Startsidan
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-slate-900 sm:text-3xl">Administration</h1>
      <AdminNav active="checkouts" />

      <section className="card mt-8">
        <HelpSectionHeading section="checkout">
          Checkouts som väntar på integration ({pending.length})
        </HelpSectionHeading>
        <p className="mt-1 text-sm text-slate-600">
          Användaren har bekräftat diff — admin måste integrera innan ändringarna blir en ny version.
        </p>

        {pending.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">Inga checkouts väntar just nu.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                  <th className="px-4 py-3 font-medium">Område</th>
                  <th className="px-4 py-3 font-medium">Ägare</th>
                  <th className="px-4 py-3 font-medium">Bekräftad</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Åtgärd</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3">
                      <Link href={`/maps/${row.mapFile.slug}`} className="link-primary">
                        {row.mapFile.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {row.user.name ?? row.user.email}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {row.userConfirmedAt
                        ? formatDate(row.userConfirmedAt)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {checkoutStatusLabel(row.status as CheckoutStatus)}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/maps/${row.mapFile.slug}/checkout/${row.id}`}
                        className="text-ifk-blue hover:underline"
                      >
                        Granska och integrera
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
