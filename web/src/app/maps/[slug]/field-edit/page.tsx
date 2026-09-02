import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { canFieldEdit } from "@/lib/auth/permissions";
import { findActiveAreaLocksForMap, getHeadVersionId, serializeCheckoutResponse } from "@/lib/checkout/repository";
import { FieldEditCreateClient } from "@/components/field-edit/field-edit-create-client";
import { HelpLinkIcon } from "@/components/help-link-icon";
import { readMapScaleFromBuffer } from "@/lib/field-edit/scale";
import { prisma } from "@/lib/prisma";
import { readStoredFile } from "@/lib/storage";

type PageProps = { params: Promise<{ slug: string }> };

export default async function FieldEditCreatePage({ params }: PageProps) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user?.role) redirect("/login");

  if (!canFieldEdit(session.user.role)) {
    redirect(`/maps/${slug}`);
  }

  const map = await prisma.mapFile.findUnique({ where: { slug } });
  if (!map || map.archivedAt) notFound();

  const headVersionId = await getHeadVersionId(map.id);
  if (!headVersionId) notFound();

  const headVersion = await prisma.mapVersion.findUnique({
    where: { id: headVersionId },
    select: { storagePath: true },
  });

  let mapScale = 15000;
  if (headVersion) {
    try {
      const buffer = await readStoredFile(headVersion.storagePath);
      mapScale = await readMapScaleFromBuffer(buffer);
    } catch {
      mapScale = 15000;
    }
  }

  const locks = await findActiveAreaLocksForMap(map.id);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <Link href={`/maps/${slug}`} className="link-muted text-sm">
        ← {map.title}
      </Link>
      <div className="mt-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">Fältredigering</h1>
          <p className="mt-2 text-sm text-slate-600">
            Admin: rita en polygon (max 1 km²) kring området du ska redigera i fält. Endast
            utcheckat område laddas i editorn.
          </p>
        </div>
        <HelpLinkIcon section="admin" className="mt-1 shrink-0" />
      </div>

      <div className="mt-6">
        <FieldEditCreateClient
          mapSlug={map.slug}
          mapTitle={map.title}
          headVersionId={headVersionId}
          mapScale={mapScale}
          existingLocks={locks.map(serializeCheckoutResponse)}
        />
      </div>
    </div>
  );
}
