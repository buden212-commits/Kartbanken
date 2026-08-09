import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  canAdminConfirmIntegration,
  canConfirmCheckoutIntegration,
  canUpload,
} from "@/lib/auth/permissions";
import { getCheckoutById, serializeCheckoutResponse } from "@/lib/checkout/repository";
import { CheckoutDetailClient } from "@/components/checkout-detail-client";
import {
  CheckoutVersionContextBanner,
  PostIntegrationCta,
  SubsetDownloadNotice,
} from "@/components/checkout-flow-extras";
import { getMapVersionContext } from "@/lib/maps/version-context";
import { HelpLinkIcon } from "@/components/help-link-icon";
import { CheckoutStatus } from "@/lib/checkout/types";
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

  const [baseVersion, versionContext] = await Promise.all([
    prisma.mapVersion.findUnique({
      where: { id: checkout.baseVersionId },
      select: { versionNumber: true, isPublished: true },
    }),
    getMapVersionContext(map.id),
  ]);

  const serialized = serializeCheckoutResponse(checkout);
  const canManagePublication = canUpload(session.user.role);
  const integratedVersion = checkout.integratedVersionId
    ? await prisma.mapVersion.findUnique({
        where: { id: checkout.integratedVersionId },
        select: { id: true, versionNumber: true },
      })
    : null;

  const previousVersionId = integratedVersion
    ? (
        await prisma.mapVersion.findFirst({
          where: {
            mapFileId: map.id,
            versionNumber: { lt: integratedVersion.versionNumber },
          },
          orderBy: { versionNumber: "desc" },
          select: { id: true },
        })
      )?.id ?? null
    : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <Link href={`/maps/${slug}`} className="link-muted text-sm">
        ← {map.title}
      </Link>
      <div className="mt-4 flex items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">Utcheckning</h1>
        <HelpLinkIcon section="checkout" className="mt-1 shrink-0" />
      </div>
      <p className="mt-2 text-sm text-slate-600">
        {checkout.user.name ?? checkout.user.email} · {map.title}
      </p>

      <div className="mt-6 space-y-6">
        {baseVersion && versionContext.head && (
          <CheckoutVersionContextBanner
            baseVersionNumber={baseVersion.versionNumber}
            baseVersionPublished={baseVersion.isPublished}
            headVersionNumber={versionContext.head.versionNumber}
            headVersionPublished={versionContext.head.isPublished}
            publishedVersionNumber={versionContext.published?.versionNumber ?? null}
          />
        )}

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
          subsetNotice={<SubsetDownloadNotice />}
        />

        {checkout.status === CheckoutStatus.INTEGRATED && integratedVersion && (
          <PostIntegrationCta
            mapSlug={map.slug}
            versionId={integratedVersion.id}
            versionNumber={integratedVersion.versionNumber}
            previousVersionId={previousVersionId}
            canManagePublication={canManagePublication}
          />
        )}
      </div>
    </div>
  );
}
