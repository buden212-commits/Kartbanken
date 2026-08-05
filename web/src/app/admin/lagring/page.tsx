import { auth } from "@/auth";
import { AdminNav } from "@/components/admin-nav";
import { AdminStorageDashboard } from "@/components/admin-storage-dashboard";
import { getStorageDashboardData } from "@/lib/admin/storage-stats";
import { canAdmin } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";

export default async function AdminLagringPage() {
  const session = await auth();
  if (!session || !canAdmin(session.user.role)) {
    redirect("/");
  }

  const data = await getStorageDashboardData();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <p className="page-eyebrow">Administration</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Lagring</h1>
      <p className="mt-2 text-sm text-slate-600">
        Översikt över hur mycket lagringsutrymme varje område använder.
      </p>

      <AdminNav active="lagring" />

      <div className="mt-8">
        <AdminStorageDashboard data={data} />
      </div>
    </div>
  );
}
