import { notFound } from "next/navigation";
import { auth } from "@/auth";
import type { AuthSession } from "@/lib/auth/api";
import { SuggestionDetailClient } from "@/components/suggestion/suggestion-detail-client";
import { canAdmin, canCreateMapSuggestion, canReviewMapSuggestion } from "@/lib/auth/permissions";
import { assertSuggestionViewAccess } from "@/lib/suggestion/access";
import { getSuggestionById, serializeSuggestionDetail } from "@/lib/suggestion/repository";
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

  return (
    <SuggestionDetailClient
      mapSlug={slug}
      mapTitle={map.title}
      suggestion={serializeSuggestionDetail(suggestion)}
      canReview={canReviewMapSuggestion(session.user.role)}
      isOwner={suggestion.createdById === session.user.id}
      isAdmin={canAdmin(session.user.role)}
    />
  );
}
