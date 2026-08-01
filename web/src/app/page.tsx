import Link from "next/link";
import { auth } from "@/auth";
import { canAdmin, canUpload } from "@/lib/auth/permissions";
import { formatBytes, formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { CreateMapForm } from "@/components/create-map-form";

export default async function HomePage() {
  const session = await auth();
  const isAdmin = session && canAdmin(session.user.role);

  const maps = await prisma.mapFile.findMany({
    orderBy: { title: "asc" },
    include: {
      versions: {
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
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="page-eyebrow">IFK Mora · Kartfiler</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            Kartfiler
          </h1>
        </div>
      </div>

      {isAdmin && (
        <section className="card mt-8">
          <h2 className="text-lg font-medium text-slate-900">Skapa ny kartfil</h2>
          <p className="mt-1 text-sm text-slate-600">
            Endast administratörer kan skapa nya logiska kartfiler.
          </p>
          <div className="mt-4">
            <CreateMapForm />
          </div>
        </section>
      )}

      <section className="mt-10">
        {maps.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <p className="text-slate-600">Inga kartfiler ännu.</p>
            {isAdmin && (
              <p className="mt-2 text-sm text-slate-500">
                Skapa en kartfil ovan och ladda upp första versionen.
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                  <th className="px-4 pb-3 pt-4 pr-4 font-medium">Kartnamn</th>
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
        )}
      </section>

      <div className="mt-10 flex flex-wrap gap-4 text-sm">
        <Link href="/poc" className="link-muted">
          OCAD-parsning (PoC)
        </Link>
        <Link href="/poc/diff" className="link-muted">
          OCD-jämförelse (PoC)
        </Link>
      </div>
    </div>
  );
}
