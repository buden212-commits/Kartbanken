import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { canCheckout } from "@/lib/auth/permissions";
import { findActiveCheckoutsForMap, getHeadVersionId } from "@/lib/checkout/repository";
import { serializeCheckoutResponse } from "@/lib/checkout/repository";
import { CheckoutPageClient } from "@/components/checkout-page-client";
import { HelpLinkIcon } from "@/components/help-link-icon";
import { prisma } from "@/lib/prisma";

type PageProps = { params: Promise<{ slug: string }> };

export default async function CheckoutCreatePage({ params }: PageProps) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user?.role) redirect("/login");

  if (!canCheckout(session.user.role)) {
    redirect(`/maps/${slug}`);
  }

  const map = await prisma.mapFile.findUnique({ where: { slug } });
  if (!map) notFound();

  const headVersionId = await getHeadVersionId(map.id);
  if (!headVersionId) notFound();

  const checkouts = await findActiveCheckoutsForMap(map.id);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <Link href={`/maps/${slug}`} className="link-muted text-sm">
        ← {map.title}
      </Link>
      <div className="mt-4 flex items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">Checka ut område</h1>
        <HelpLinkIcon section="checkout" className="mt-1 shrink-0" />
      </div>
      <p className="mt-2 text-sm text-slate-600">
        Rita ett område på kartan. Befintliga checkouts visas som färgade ytor.
      </p>

      <div className="mt-6">
        <CheckoutPageClient
          mapSlug={map.slug}
          mapTitle={map.title}
          headVersionId={headVersionId}
          existingCheckouts={checkouts.map(serializeCheckoutResponse)}
        />
      </div>
    </div>
  );
}
