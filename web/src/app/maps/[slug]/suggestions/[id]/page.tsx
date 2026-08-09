import { notFound } from "next/navigation";
import { auth } from "@/auth";
import type { AuthSession } from "@/lib/auth/api";
import { SuggestionDetailClient } from "@/components/suggestion/suggestion-detail-client";
import { canAdmin, canCreateMapSuggestion, canReviewMapSuggestion } from "@/lib/auth/permissions";
import { findCheckoutsForMap } from "@/lib/checkout/repository";
import { checkoutStatusLabel } from "@/lib/checkout/types";
import { assertSuggestionViewAccess } from "@/lib/suggestion/access";
import {
  getLatestPublishedVersionNumber,
  getSuggestionById,
  serializeSuggestionDetail,
} from "@/lib/suggestion/repository";
import { prisma } from "@/lib/prisma";

type PageProps = {
  params: Promise<{ slug: string; id: string }>;
};

export default async function SuggestionDetailPage({ params }: PageProps) {
  const { slug, id } = await params;
  const session = await auth();
  if (!session?.user?.id || !session.user.role) notFound();
  if (!canCreateMapSuggestion(session.user.role)) notFound();

  const map = await prisma.mapFile.findUnique({
    where: { slug },
    select: { id: true, title: true },
  });
  if (!map) notFound();

  const suggestion = await getSuggestionById(id);
  if (!suggestion || suggestion.mapFileId !== map.id) notFound();

  const denied = assertSuggestionViewAccess(session as AuthSession, suggestion);
  if (denied) notFound();

  const [latestPublishedVersionNumber, checkouts, publishedVersions] = await Promise.all([
    getLatestPublishedVersionNumber(map.id),
    findCheckoutsForMap(map.id),
    prisma.mapVersion.findMany({
      where: { mapFileId: map.id, isPublished: true },
      orderBy: { versionNumber: "desc" },
      select: { id: true, versionNumber: true },
    }),
  ]);

  const checkoutOptions = checkouts.map((c) => ({
    id: c.id,
    label: `${c.user.name?.trim() || c.user.email} · ${checkoutStatusLabel(c.status as Parameters<typeof checkoutStatusLabel>[0])}`,
    integratedVersionId: c.integratedVersionId,
  }));

  return (
    <SuggestionDetailClient
      mapSlug={slug}
      mapTitle={map.title}
      suggestion={serializeSuggestionDetail(suggestion, latestPublishedVersionNumber)}
      canReview={canReviewMapSuggestion(session.user.role)}
      isOwner={suggestion.createdById === session.user.id}
      isAdmin={canAdmin(session.user.role)}
      checkoutOptions={checkoutOptions}
      publishedVersions={publishedVersions}
    />
  );
}
