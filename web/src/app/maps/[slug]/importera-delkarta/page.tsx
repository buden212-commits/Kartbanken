import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { canCheckout } from "@/lib/auth/permissions";
import { ImportPartialWizard } from "@/components/import-partial-wizard";
import { HelpLinkIcon } from "@/components/help-link-icon";
import { getHeadVersionId } from "@/lib/checkout/repository";
import { prisma } from "@/lib/prisma";

type PageProps = { params: Promise<{ slug: string }> };

export default async function ImportPartialPage({ params }: PageProps) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user?.role) redirect("/login");
  if (!canCheckout(session.user.role)) {
    redirect(`/maps/${slug}`);
  }

  const map = await prisma.mapFile.findUnique({
    where: { slug },
    select: { slug: true, title: true, archivedAt: true, id: true },
  });
  if (!map) notFound();
  if (map.archivedAt) redirect(`/maps/${slug}`);

  const headVersionId = await getHeadVersionId(map.id);
  if (!headVersionId) notFound();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <Link href={`/maps/${slug}`} className="link-muted text-sm">
        ← {map.title}
      </Link>
      <div className="mt-4 flex items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">Importera delkarta</h1>
        <HelpLinkIcon section="checkout" className="mt-1 shrink-0" />
      </div>
      <p className="mt-2 text-sm text-slate-600">
        Steg för steg: först symboler, sedan läge och kanter, därefter ändringar. Använd när du har
        en .ocd som bara täcker en del av kartan och den aldrig checkades ut här.
      </p>
      <div className="mt-6">
        <ImportPartialWizard
          mapSlug={map.slug}
          mapTitle={map.title}
          headVersionId={headVersionId}
        />
      </div>
    </div>
  );
}
