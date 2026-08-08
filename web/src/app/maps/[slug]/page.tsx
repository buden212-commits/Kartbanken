import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { canAdmin, canCheckout, canCreateCourse, canCreateMapSuggestion, canReviewMapSuggestion, canUpload } from "@/lib/auth/permissions";
import { MapTitleEditor } from "@/components/map-title-editor";
import { findActiveCheckoutsForMap, getHeadVersionId, serializeCheckoutResponse } from "@/lib/checkout/repository";
import { listCoursesForMap, serializeCourseSummary } from "@/lib/course/repository";
import { versionVisibilityFilter } from "@/lib/maps/version-query";
import { canViewVersion } from "@/lib/auth/version-access";
import { prisma } from "@/lib/prisma";
import { UploadVersionForm } from "@/components/upload-version-form";
import { HelpLinkIcon, HelpSectionHeading } from "@/components/help-link-icon";
import { VersionHistoryList } from "@/components/version-history-list";
import { CheckoutAreaCta } from "@/components/checkout-area-cta";
import { CheckoutListPanel } from "@/components/checkout-list-panel";
import { CheckoutOverviewMap } from "@/components/checkout-overview-map";
import { SuggestionAreaSection } from "@/components/suggestion/suggestion-map-overlay";
import { CourseListPanel } from "@/components/course/course-list-panel";
import { listSuggestionsForMap, serializeSuggestionSummary, getLatestPublishedVersionNumber } from "@/lib/suggestion/repository";
import { Role } from "@/lib/roles";

type PageProps = { params: Promise<{ slug: string }> };

export default async function MapDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const session = await auth();
  const role = session?.user.role;
  const canUploadVersion = !!(session && role && canUpload(role));
  const canManagePublication = canUploadVersion;
  const canCreateCheckout = !!(session && role && canCheckout(role));
  const isAdmin = !!(session && role && canAdmin(role));

  const map = await prisma.mapFile.findUnique({
    where: { slug },
    include: {
      versions: {
        where: versionVisibilityFilter(role),
        orderBy: { versionNumber: "desc" },
      },
    },
  });

  if (!map) notFound();

  const activeCheckouts = await findActiveCheckoutsForMap(map.id);
  const headVersionId = await getHeadVersionId(map.id);
  const checkoutListItems = activeCheckouts.map(serializeCheckoutResponse);

  const courseList =
    session?.user?.id && role && canCreateCourse(role)
      ? (await listCoursesForMap(map.id, session.user.id)).map(serializeCourseSummary)
      : [];

  const suggestionList =
    session?.user?.id && role && canCreateMapSuggestion(role)
      ? await (async () => {
          const [rows, latestPublished] = await Promise.all([
            listSuggestionsForMap(map.id),
            getLatestPublishedVersionNumber(map.id),
          ]);
          return rows.map((s) => serializeSuggestionSummary(s, latestPublished));
        })()
      : [];

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

  const versionHistoryItems = map.versions.map((version, index) => {
    const uploader = version.uploadedById ? uploaderMap.get(version.uploadedById) : null;
    return {
      id: version.id,
      versionNumber: version.versionNumber,
      originalFilename: version.originalFilename,
      uploadedAt: version.uploadedAt.toISOString(),
      fileSizeBytes: Number(version.fileSizeBytes),
      comment: version.comment,
      parseStatus: version.parseStatus,
      objectCount: version.objectCount,
      isPublished: version.isPublished,
      uploaderLabel: uploader?.name ?? uploader?.email ?? "—",
      previousVersionId: map.versions[index + 1]?.id,
      canView: role ? canViewVersion(role, version.isPublished) : false,
    };
  });

  const publishedVersions = map.versions.filter((v) => v.isPublished);
  const latestPublishedVersion = publishedVersions[0] ?? null;
  const latestComparePair =
    publishedVersions.length >= 2
      ? [publishedVersions[1]!, publishedVersions[0]!]
      : canManagePublication && map.versions.length >= 2
        ? [map.versions[1]!, map.versions[0]!]
        : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <Link href="/" className="link-muted text-sm">
        ← Alla områden
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <MapTitleEditor
            mapSlug={map.slug}
            initialTitle={map.title}
            canEdit={isAdmin}
            showDelete={isAdmin}
          />
          {map.description && <p className="mt-2 text-slate-600">{map.description}</p>}
        </div>
        {canCreateCheckout && (
          <CheckoutAreaCta
            mapSlug={map.slug}
            canCheckout={canCreateCheckout}
            headVersionId={headVersionId}
          />
        )}
      </div>

      {canUploadVersion && (
        <section className="card mt-8">
          <HelpSectionHeading section="versioner">Ladda upp ny version</HelpSectionHeading>
          <p className="mt-1 text-sm text-slate-600">
            Uppladdning skapar en ny version — tidigare versioner behålls. Efter uppladdning
            jämförs automatiskt med föregående version. Nya versioner är opublicerade tills du
            markerar dem som publicerade.
          </p>
          <div className="mt-4">
            <UploadVersionForm
              mapSlug={map.slug}
              activeCheckouts={checkoutListItems.map((checkout) => ({
                id: checkout.id,
                userLabel: checkout.user.name ?? checkout.user.email,
                createdAt: checkout.createdAt,
                objectCount: checkout.selection.objectIds.length,
              }))}
            />
          </div>
        </section>
      )}

      <section className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="text-lg font-medium text-slate-900">
              Versionshistorik ({map.versions.length})
            </h2>
            <HelpLinkIcon section="versioner" />
            {canManagePublication && (
              <HelpLinkIcon section="publicering" label="Hjälp om publicering" />
            )}
          </div>
          {latestComparePair && (
            <Link
              href={`/maps/${map.slug}/compare?v1=${latestComparePair[0].id}&v2=${latestComparePair[1].id}`}
              className="rounded-lg border border-ifk-blue/30 bg-ifk-blue-pale px-4 py-2 text-sm font-medium text-ifk-blue transition hover:border-ifk-blue hover:bg-ifk-blue-muted"
            >
              Jämför senaste två versioner
            </Link>
          )}
        </div>

        {map.versions.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">Inga versioner uppladdade ännu.</p>
        ) : (
          <VersionHistoryList
            mapSlug={map.slug}
            versions={versionHistoryItems}
            canManagePublication={!!canManagePublication}
            canDelete={isAdmin}
          />
        )}
      </section>

      {latestPublishedVersion &&
        session?.user?.id &&
        role &&
        canCreateMapSuggestion(role) && (
        <SuggestionAreaSection
          mapSlug={map.slug}
          versionId={latestPublishedVersion.id}
          versionNumber={latestPublishedVersion.versionNumber}
          suggestions={suggestionList}
          canReview={canReviewMapSuggestion(role)}
          isAdmin={role === Role.ADMIN}
        />
      )}

      {headVersionId && activeCheckouts.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-medium text-slate-900">Checkout-områden på kartan</h2>
          <p className="mt-1 text-sm text-slate-600">
            Färgade ytor visar vem som checkat ut vad (read-only).
          </p>
          <CheckoutOverviewMap
            mapSlug={map.slug}
            headVersionId={headVersionId}
            checkouts={checkoutListItems}
          />
        </section>
      )}

      {session?.user?.id && (
        <CheckoutListPanel
          mapSlug={map.slug}
          checkouts={checkoutListItems}
          sessionUserId={session.user.id}
          isAdmin={role === Role.ADMIN}
          canCheckout={canCreateCheckout}
          headVersionId={headVersionId}
        />
      )}

      {session?.user?.id && role && canCreateCourse(role) && (
        <CourseListPanel
          mapSlug={map.slug}
          courses={courseList}
          sessionUserId={session.user.id}
          isAdmin={role === Role.ADMIN}
        />
      )}
    </div>
  );
}
