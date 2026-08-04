import Link from "next/link";
import { auth } from "@/auth";
import { canAdmin } from "@/lib/auth/permissions";
import { formatBytes, formatDate } from "@/lib/format";
import { versionVisibilityFilter } from "@/lib/maps/version-query";
import { prisma } from "@/lib/prisma";
import { CreateMapForm } from "@/components/create-map-form";

export default async function HomePage() {
  const session = await auth();
  const isAdmin = session && canAdmin(session.user.role);
  const visibilityFilter = versionVisibilityFilter(session?.user.role);

  const maps = await prisma.mapFile.findMany({
    orderBy: { title: "asc" },
    include: {
      versions: {
        where: visibilityFilter,
        orderBy: { versionNumber: "desc" },
        take: 1,
      },
    },
  });

  const uploaderIds = [
    ...new Set(
      maps.flatMap((m) => m.versions.map((v) => v.uploadedById).filter(Boolean)),
    ),
  ] as string[];

  const uploaders = uploaderIds.length
    ? await prisma.user.findMany({
        where: { id: { in: uploaderIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const uploaderMap = new Map(uploaders.map((u) => [u.id, u]));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="page-eyebrow">IFK Mora · Område</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Område
          </h1>
        </div>
      </div>

      <section className="mt-8">
        {maps.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <p className="text-slate-600">Inga områden ännu.</p>
            {isAdmin && (
              <p className="mt-2 text-sm text-slate-500">
                Skapa ett område nedan och ladda upp första versionen.
              </p>
            )}
          </div>
        ) : (
          <>
            <ul className="space-y-3 md:hidden">
              {maps.map((map) => {
                const latest = map.versions[0];
                const uploader = latest?.uploadedById
                  ? uploaderMap.get(latest.uploadedById)
                  : null;

                return (
                  <li
                    key={map.id}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <Link
                      href={`/maps/${map.slug}`}
                      className="link-primary text-base"
                    >
                      {map.title}
                    </Link>
                    {map.description && (
                      <p className="mt-1 text-sm text-slate-500">{map.description}</p>
                    )}
                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-slate-600">
                      <div>
                        <dt className="text-slate-400">Version</dt>
                        <dd className="mt-0.5 font-medium text-slate-800">
                          {latest ? `v${latest.versionNumber}` : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-400">Storlek</dt>
                        <dd className="mt-0.5">
                          {latest ? formatBytes(latest.fileSizeBytes) : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-400">Uppladdad</dt>
                        <dd className="mt-0.5">
                          {latest ? formatDate(latest.uploadedAt) : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-400">Av</dt>
                        <dd className="mt-0.5 truncate">
                          {uploader?.name ?? uploader?.email ?? "—"}
                        </dd>
                      </div>
                    </dl>
                  </li>
                );
              })}
            </ul>

            <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                    <th className="px-4 pb-3 pt-4 pr-4 font-medium">Område</th>
                    <th className="pb-3 pt-4 pr-4 font-medium">Senaste version</th>
                    <th className="pb-3 pt-4 pr-4 font-medium">Uppladdad</th>
                    <th className="pb-3 pt-4 pr-4 font-medium">Storlek</th>
                    <th className="pb-3 pt-4 px-4 font-medium">Av</th>
                  </tr>
                </thead>
                <tbody>
                  {maps.map((map) => {
                    const latest = map.versions[0];
                    const uploader = latest?.uploadedById
                      ? uploaderMap.get(latest.uploadedById)
                      : null;

                    return (
                      <tr key={map.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-3 pr-4">
                          <Link href={`/maps/${map.slug}`} className="link-primary">
                            {map.title}
                          </Link>
                          {map.description && (
                            <p className="mt-0.5 text-xs text-slate-500">{map.description}</p>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-slate-700">
                          {latest ? `v${latest.versionNumber}` : "—"}
                        </td>
                        <td className="py-3 pr-4 text-slate-600">
                          {latest ? formatDate(latest.uploadedAt) : "—"}
                        </td>
                        <td className="py-3 pr-4 text-slate-600">
                          {latest ? formatBytes(latest.fileSizeBytes) : "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {uploader?.name ?? uploader?.email ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {isAdmin && (
        <section className="card mt-10">
          <h2 className="text-lg font-medium text-slate-900">Skapa nytt kartområde</h2>
          <p className="mt-1 text-sm text-slate-600">
            Endast administratörer kan skapa nya områden.
          </p>
          <div className="mt-4">
            <CreateMapForm />
          </div>
        </section>
      )}
    </div>
  );
}
