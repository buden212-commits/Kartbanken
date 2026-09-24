import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AdminNav } from "@/components/admin-nav";
import { AdminDuplicateScanClient } from "@/components/admin-duplicate-scan-client";
import { HelpSectionHeading } from "@/components/help-link-icon";
import { listMapsForDuplicateScan } from "@/lib/admin/duplicate-scan";
import { canAdmin } from "@/lib/auth/permissions";

export default async function AdminDuplicatesPage() {
  const session = await auth();
  if (!session?.user?.role || !canAdmin(session.user.role)) redirect("/");

  const maps = await listMapsForDuplicateScan();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <Link href="/" className="link-muted text-sm">
        ← Startsidan
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-slate-900 sm:text-3xl">Administration</h1>
      <AdminNav active="dubbletter" />

      <section className="mt-8">
        <HelpSectionHeading section="admin">Dubbletter</HelpSectionHeading>
        <p className="mt-1 text-sm text-slate-600">
          Validera en kartversion för exakta dubbletter — objekt med identisk symbol och geometri
          som kan uppstå efter felaktig incheckningsmatchning.
        </p>
        <div className="mt-6">
          <AdminDuplicateScanClient maps={maps} />
        </div>
      </section>
    </div>
  );
}
