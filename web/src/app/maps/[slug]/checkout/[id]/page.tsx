import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  canAdminConfirmIntegration,
  canConfirmCheckoutIntegration,
} from "@/lib/auth/permissions";
import { getCheckoutById, serializeCheckoutResponse } from "@/lib/checkout/repository";
import { CheckoutDetailClient } from "@/components/checkout-detail-client";
import { HelpLinkIcon } from "@/components/help-link-icon";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";

type PageProps = { params: Promise<{ slug: string; id: string }> };

export default async function CheckoutDetailPage({ params }: PageProps) {
  const { slug, id } = await params;
  const session = await auth();
  if (!session?.user?.id || !session.user.role) redirect("/login");

  const map = await prisma.mapFile.findUnique({ where: { slug } });
  if (!map) notFound();

  const checkout = await getCheckoutById(map.id, id);
  if (!checkout) notFound();

  const canView =
    canAdminConfirmIntegration(session.user.role) ||
    canConfirmCheckoutIntegration(session.user.role, checkout.userId, session.user.id);

  if (!canView) notFound();

  const serialized = serializeCheckoutResponse(checkout);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <Link href={`/maps/${slug}`} className="link-muted text-sm">
        ← {map.title}
      </Link>
      <div className="mt-4 flex items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">Checkout</h1>
        <HelpLinkIcon section="checkout" className="mt-1 shrink-0" />
      </div>
      <p className="mt-2 text-sm text-slate-600">
        {checkout.user.name ?? checkout.user.email} · {map.title}
      </p>

      <div className="mt-6">
        <CheckoutDetailClient
          mapSlug={map.slug}
          mapTitle={map.title}
          checkout={{
            ...serialized,
            diffSummaryJson: serialized.diffSummaryJson,
          }}
          sessionUserId={session.user.id}
          isAdmin={session.user.role === Role.ADMIN}
          isOwner={checkout.userId === session.user.id}
        />
      </div>
    </div>
  );
}
