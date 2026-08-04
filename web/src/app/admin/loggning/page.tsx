import { auth } from "@/auth";
import { AdminNav } from "@/components/admin-nav";
import { AdminAuditLogPanel } from "@/components/admin-audit-log-panel";
import { canAdmin } from "@/lib/auth/permissions";
import {
  listAuditLogUsers,
  listAuditLogs,
  type AuditLogSortDir,
  type AuditLogSortField,
} from "@/lib/audit-log-query";
import { redirect } from "next/navigation";
import { Suspense } from "react";

type PageProps = {
  searchParams: Promise<{
    user?: string;
    sort?: string;
    dir?: string;
  }>;
};

function parseSort(value: string | undefined): AuditLogSortField {
  if (value === "name" || value === "activity" || value === "date") return value;
  return "date";
}

function parseDir(value: string | undefined, sort: AuditLogSortField): AuditLogSortDir {
  if (value === "asc" || value === "desc") return value;
  return sort === "date" ? "desc" : "asc";
}

export default async function AdminLoggningPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session || !canAdmin(session.user.role)) {
    redirect("/");
  }

  const params = await searchParams;
  const sort = parseSort(params.sort);
  const dir = parseDir(params.dir, sort);
  const userId = params.user?.trim() || undefined;

  const [users, logResult] = await Promise.all([
    listAuditLogUsers(),
    listAuditLogs({ userId, sort, dir }),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <p className="page-eyebrow">Administration</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Loggning</h1>
      <p className="mt-2 text-sm text-slate-600">
        Händelser i systemet — inloggningar, uppladdningar, utcheckningar, incheckningar med mera.
      </p>

      <AdminNav active="loggning" />

      <section className="card mt-8">
        <Suspense fallback={<p className="text-sm text-slate-500">Laddar logg…</p>}>
          <AdminAuditLogPanel
            rows={logResult.rows}
            users={users}
            sort={sort}
            dir={dir}
            userId={userId}
            truncated={logResult.truncated}
          />
        </Suspense>
      </section>
    </div>
  );
}
