import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { SuggestionCreateClient } from "@/components/suggestion/suggestion-create-client";
import { canCreateMapSuggestion } from "@/lib/auth/permissions";
import { getMapVersionOr404 } from "@/lib/maps/version-lookup";

export const maxDuration = 300;

type PageProps = {
  params: Promise<{ slug: string; id: string }>;
};

export default async function SuggestMapChangePage({ params }: PageProps) {
  const { slug, id } = await params;
  const session = await auth();
  if (!session?.user?.id || !session.user.role) notFound();
  if (!canCreateMapSuggestion(session.user.role)) notFound();

  const lookup = await getMapVersionOr404(slug, id);
  if (lookup instanceof Response) notFound();

  if (!lookup.version.isPublished) {
    redirect(`/maps/${slug}/versions/${id}`);
  }

  return (
    <SuggestionCreateClient
      mapSlug={slug}
      mapTitle={lookup.map.title}
      versionId={lookup.version.id}
      versionNumber={lookup.version.versionNumber}
    />
  );
}
