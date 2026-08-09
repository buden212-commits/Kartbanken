import Link from "next/link";
import type { StorageDashboardData } from "@/lib/admin/storage-stats";
import { formatBytes } from "@/lib/format";

type Props = {
  data: StorageDashboardData;
};

function megabytes(bytes: number): string {
  return (bytes / 1_048_576).toFixed(1);
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function HorizontalBar({
  label,
  value,
  max,
  href,
  suffix,
}: {
  label: string;
  value: number;
  max: number;
  href?: string;
  suffix: string;
}) {
  const width = max > 0 ? Math.max(2, (value / max) * 100) : 0;

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
        {href ? (
          <Link href={href} className="font-medium text-ifk-blue hover:text-ifk-blue-hover">
            {label}
          </Link>
        ) : (
          <span className="font-medium text-slate-800">{label}</span>
        )}
        <span className="shrink-0 tabular-nums text-slate-600">{suffix}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-ifk-blue transition-all"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

export function AdminStorageDashboard({ data }: Props) {
  const { totals, maps, monthlyUploads, backend } = data;
  const maxMapBytes = maps[0]?.versionBytes ?? 0;
  const maxMonthlyBytes = Math.max(...monthlyUploads.map((row) => row.bytes), 1);

  const mapsWithStorage = maps.filter((map) => map.versionBytes > 0);
  const topMaps = mapsWithStorage.slice(0, 8);
  const otherBytes = mapsWithStorage.slice(8).reduce((sum, map) => sum + map.versionBytes, 0);

  const backendLabel = backend === "blob" ? "Vercel Blob" : "Lokal disk";

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total lagring"
          value={`${megabytes(totals.versionBytes)} MB`}
          hint={`${totals.versionCount} kartversioner`}
        />
        <StatCard
          label="Områden"
          value={String(totals.mapCount)}
          hint={
            totals.mapCount > 0
              ? `Snitt ${megabytes(totals.versionBytes / totals.mapCount)} MB per område`
              : undefined
          }
        />
        <StatCard
          label="Utcheckningsfiler"
          value={String(totals.checkoutFileCount)}
          hint="Antal subset/checkin-filer (storlek ej spårad)"
        />
        <StatCard
          label="Lagringsbackend"
          value={backendLabel}
          hint={`${totals.courseCount} banor i databasen`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="text-lg font-medium text-slate-900">Lagring per område</h2>
          <p className="mt-1 text-sm text-slate-600">
            Summan av alla .ocd-versioner per kartområde.
          </p>
          {topMaps.length === 0 ? (
            <p className="mt-6 text-sm text-slate-500">Inga uppladdade kartversioner ännu.</p>
          ) : (
            <div className="mt-6 space-y-4">
              {topMaps.map((map) => (
                <HorizontalBar
                  key={map.id}
                  label={map.title}
                  value={map.versionBytes}
                  max={maxMapBytes}
                  href={`/maps/${map.slug}`}
                  suffix={`${megabytes(map.versionBytes)} MB · ${map.versionCount} ver.`}
                />
              ))}
              {otherBytes > 0 && (
                <HorizontalBar
                  label="Övriga områden"
                  value={otherBytes}
                  max={maxMapBytes}
                  suffix={`${megabytes(otherBytes)} MB · ${mapsWithStorage.length - 8} omr.`}
                />
              )}
            </div>
          )}
        </section>

        <section className="card">
          <h2 className="text-lg font-medium text-slate-900">Uppladdningar per månad</h2>
          <p className="mt-1 text-sm text-slate-600">Senaste sex månaderna — volym och antal.</p>
          <div className="mt-6 flex items-end justify-between gap-2 sm:gap-3">
            {monthlyUploads.map((month) => {
              const heightPct = Math.max(4, (month.bytes / maxMonthlyBytes) * 100);
              return (
                <div key={month.monthKey} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                  <span className="text-xs tabular-nums text-slate-500">
                    {month.count > 0 ? month.count : ""}
                  </span>
                  <div className="flex h-36 w-full items-end">
                    <div
                      className="w-full rounded-t-md bg-ifk-blue"
                      style={{
                        height: `${heightPct}%`,
                        opacity: month.bytes > 0 ? 1 : 0.15,
                      }}
                      title={`${formatBytes(month.bytes)} · ${month.count} uppladdningar`}
                    />
                  </div>
                  <span className="text-center text-[11px] leading-tight text-slate-600 sm:text-xs">
                    {month.monthLabel}
                  </span>
                  <span className="text-center text-[10px] tabular-nums text-slate-400 sm:text-xs">
                    {month.bytes > 0 ? `${megabytes(month.bytes)} MB` : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <section className="card">
        <h2 className="text-lg font-medium text-slate-900">Versioner per område</h2>
        <p className="mt-1 text-sm text-slate-600">Antal sparade kartversioner.</p>
        <div className="mt-6 space-y-3">
          {maps
            .filter((map) => map.versionCount > 0)
            .slice(0, 10)
            .map((map) => (
              <HorizontalBar
                key={`versions-${map.id}`}
                label={map.title}
                value={map.versionCount}
                max={Math.max(...maps.map((row) => row.versionCount), 1)}
                href={`/maps/${map.slug}`}
                suffix={`${map.versionCount} st`}
              />
            ))}
          {maps.every((map) => map.versionCount === 0) && (
            <p className="text-sm text-slate-500">Inga versioner ännu.</p>
          )}
        </div>
      </section>

      <section className="card overflow-x-auto">
        <h2 className="text-lg font-medium text-slate-900">Detaljer per område</h2>
        <table className="mt-4 w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th className="pb-3 pr-4 font-medium">Område</th>
              <th className="pb-3 pr-4 font-medium text-right">Lagring</th>
              <th className="pb-3 pr-4 font-medium text-right">Versioner</th>
              <th className="pb-3 pr-4 font-medium text-right">Utcheckn.filer</th>
              <th className="pb-3 font-medium text-right">Banor</th>
            </tr>
          </thead>
          <tbody>
            {maps.map((map) => (
              <tr key={map.id} className="border-b border-slate-100 last:border-0">
                <td className="py-3 pr-4">
                  <Link
                    href={`/maps/${map.slug}`}
                    className="font-medium text-ifk-blue hover:text-ifk-blue-hover"
                  >
                    {map.title}
                  </Link>
                </td>
                <td className="py-3 pr-4 text-right tabular-nums text-slate-800">
                  {formatBytes(map.versionBytes)}
                </td>
                <td className="py-3 pr-4 text-right tabular-nums text-slate-600">
                  {map.versionCount}
                </td>
                <td className="py-3 pr-4 text-right tabular-nums text-slate-600">
                  {map.checkoutFileCount}
                </td>
                <td className="py-3 text-right tabular-nums text-slate-600">{map.courseCount}</td>
              </tr>
            ))}
            {maps.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-500">
                  Inga områden skapade ännu.
                </td>
              </tr>
            )}
          </tbody>
          {maps.length > 0 && (
            <tfoot>
              <tr className="border-t border-slate-200 font-medium text-slate-900">
                <td className="pt-3 pr-4">Totalt</td>
                <td className="pt-3 pr-4 text-right tabular-nums">
                  {formatBytes(totals.versionBytes)}
                </td>
                <td className="pt-3 pr-4 text-right tabular-nums">{totals.versionCount}</td>
                <td className="pt-3 pr-4 text-right tabular-nums">{totals.checkoutFileCount}</td>
                <td className="pt-3 text-right tabular-nums">{totals.courseCount}</td>
              </tr>
            </tfoot>
          )}
        </table>
        <p className="mt-4 text-xs text-slate-500">
          Storleken baseras på registrerade .ocd-filer vid uppladdning. Förhandsvisningar (SVG),
          utcheckningsfiler och diff-data ingår inte i MB-siffrorna.
        </p>
      </section>
    </div>
  );
}
