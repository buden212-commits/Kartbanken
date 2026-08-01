import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { canUpload } from "@/lib/auth/permissions";
import { formatBytes, formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { UploadVersionForm } from "@/components/upload-version-form";

type PageProps = { params: Promise<{ slug: string }> };

export default async function MapDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const session = await auth();
  const canUploadVersion = session && canUpload(session.user.role);

  const map = await prisma.mapFile.findUnique({
    where: { slug },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
      },
    },
  });

  if (!map) notFound();

  const uploaderIds = [
    ...new Set(map.versions.map((v) => v.uploadedById).filter(Boolean)),
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
      <Link href="/" className="link-muted text-sm">
        ← Alla kartfiler
      </Link>

      <h1 className="mt-4 text-3xl font-semibold text-slate-900">{map.title}</h1>
      {map.description && <p className="mt-2 text-slate-600">{map.description}</p>}

      {canUploadVersion && (
        <section className="card mt-8">
          <h2 className="text-lg font-medium text-slate-900">Ladda upp ny version</h2>
          <p className="mt-1 text-sm text-slate-600">
            Uppladdning skapar en ny version — tidigare versioner behålls. Efter uppladdning
            jämförs automatiskt med föregående version.
          </p>
          <div className="mt-4">
            <UploadVersionForm mapSlug={map.slug} />
          </div>
        </section>
      )}

      <section className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-medium text-slate-900">
            Versionshistorik ({map.versions.length})
          </h2>
          {map.versions.length >= 2 && (
            <Link
              href={`/maps/${map.slug}/compare?v1=${map.versions[1]!.id}&v2=${map.versions[0]!.id}`}
              className="rounded-lg border border-ifk-blue/30 bg-ifk-blue-pale px-4 py-2 text-sm font-medium text-ifk-blue transition hover:border-ifk-blue hover:bg-ifk-blue-muted"
            >
              Jämför senaste två versioner
            </Link>
          )}
        </div>

        {map.versions.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">Inga versioner uppladdade ännu.</p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                  <th className="px-4 pb-3 pt-4 pr-4 font-medium">Version</th>
                  <th className="pb-3 pt-4 pr-4 font-medium">Filnamn</th>
                  <th className="pb-3 pt-4 pr-4 font-medium">Datum</th>
                  <th className="pb-3 pt-4 pr-4 font-medium">Storlek</th>
                  <th className="pb-3 pt-4 pr-4 font-medium">Uppladdare</th>
                  <th className="pb-3 pt-4 pr-4 font-medium">Kommentar</th>
                  <th className="pb-3 pt-4 pr-4 font-medium">Status</th>
                  <th className="pb-3 pt-4 px-4 font-medium">Åtgärder</th>
                </tr>
              </thead>
              <tbody>
                {map.versions.map((version, index) => {
                  const uploader = version.uploadedById
                    ? uploaderMap.get(version.uploadedById)
                    : null;
                  const previousVersion = map.versions[index + 1];

                  const parseLabel =
                    version.parseStatus === "OK"
                      ? `${version.objectCount?.toLocaleString("sv-SE") ?? "?"} objekt`
                      : version.parseStatus === "PROCESSING"
                        ? "Parsar…"
                        : version.parseStatus === "ERROR"
                          ? "Parsningsfel"
                          : "Väntar";

                  return (
                    <tr key={version.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3 pr-4 font-mono text-slate-700">
                        v{version.versionNumber}
                      </td>
                      <td
                        className="max-w-[200px] truncate py-3 pr-4"
                        title={version.originalFilename}
                      >
                        {version.originalFilename}
                      </td>
                      <td className="py-3 pr-4 text-slate-600">
                        {formatDate(version.uploadedAt)}
                      </td>
                      <td className="py-3 pr-4 text-slate-600">
                        {formatBytes(version.fileSizeBytes)}
                      </td>
                      <td className="py-3 pr-4 text-slate-600">
                        {uploader?.name ?? uploader?.email ?? "—"}
                      </td>
                      <td className="max-w-[180px] truncate py-3 pr-4 text-slate-600">
                        {version.comment ?? "—"}
                      </td>
                      <td className="py-3 pr-4 text-xs text-slate-500">{parseLabel}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <a
                            href={`/api/maps/${map.slug}/versions/${version.id}/download`}
                            className="rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                          >
                            Ladda ner
                          </a>
                          {previousVersion && (
                            <Link
                              href={`/maps/${map.slug}/compare?v1=${previousVersion.id}&v2=${version.id}`}
                              className="rounded-md border border-ifk-blue/30 bg-ifk-blue-pale px-3 py-1 text-xs font-medium text-ifk-blue transition hover:border-ifk-blue"
                            >
                              Jämför
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
