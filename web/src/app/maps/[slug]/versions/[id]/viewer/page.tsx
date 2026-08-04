import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { assertVersionViewAccess, getMapVersionOr404 } from "@/lib/maps/version-lookup";
import { getHeadVersionId } from "@/lib/checkout/repository";
import { FullscreenMapViewer } from "@/components/fullscreen-map-viewer";
import { prisma } from "@/lib/prisma";

export const maxDuration = 300;

type PageProps = {
  params: Promise<{ slug: string; id: string }>;
};

export default async function FullscreenMapPage({ params }: PageProps) {
  const { slug, id } = await params;
  const session = await auth();
  if (!session?.user?.id || !session.user.role) notFound();

  const lookup = await getMapVersionOr404(slug, id);
  if (lookup instanceof Response) notFound();

  const denied = assertVersionViewAccess(
    {
      user: {
        id: session.user.id,
        email: session.user.email ?? "",
        name: session.user.name,
        role: session.user.role,
      },
    },
    lookup.version,
  );
  if (denied) notFound();

  const version = await prisma.mapVersion.findUnique({
    where: { id: lookup.version.id },
    select: { id: true, versionNumber: true },
  });
  if (!version) notFound();

  const headVersionId = await getHeadVersionId(lookup.map.id);

  return (
    <FullscreenMapViewer
      mapSlug={slug}
      mapTitle={lookup.map.title}
      versionId={version.id}
      versionNumber={version.versionNumber}
      headVersionId={headVersionId ?? undefined}
    />
  );
}
