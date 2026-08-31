import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { canAdmin, canCheckout, canCreateCourse, canCreateMapSuggestion, canReviewMapSuggestion, canUpload, canViewCheckouts } from "@/lib/auth/permissions";
import { MapTitleEditor } from "@/components/map-title-editor";
import { findActiveCheckoutsForMap, findCheckoutHistoryForMap, getHeadVersionId, serializeCheckoutResponse } from "@/lib/checkout/repository";
import { isMapArchived } from "@/lib/maps/archive-map";
import { listCoursesForMap, serializeCourseSummary } from "@/lib/course/repository";
import { versionVisibilityFilter } from "@/lib/maps/version-query";
import { canViewVersion, isReader } from "@/lib/auth/version-access";
import { prisma } from "@/lib/prisma";
import { UploadVersionForm } from "@/components/upload-version-form";
import { HelpSectionHeading } from "@/components/help-link-icon";
import { VersionHistoryList } from "@/components/version-history-list";
import { VersionComparePicker } from "@/components/version-compare-picker";
import { CheckoutAreaCta } from "@/components/checkout-area-cta";
import { CheckoutListPanel } from "@/components/checkout-list-panel";
import { CheckoutOverviewMap } from "@/components/checkout-overview-map";
import { SuggestionAreaSection } from "@/components/suggestion/suggestion-map-overlay";
import { CourseListPanel } from "@/components/course/course-list-panel";
import { listPendingSuggestionsForMap, serializeSuggestionSummary, getLatestPublishedVersionNumber, listPendingSuggestionsByVersion } from "@/lib/suggestion/repository";
import { Role } from "@/lib/roles";
import { CheckoutHistoryPanel } from "@/components/checkout-history-panel";
import { MapArchiveButton } from "@/components/map-archive-button";
import { AreaStatusBanner } from "@/components/area-status-banner";

type PageProps = { params: Promise<{ slug: string }> };

export default async function MapDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const session = await auth();
  const role = session?.user.role;
  const canUploadVersion = !!(session && role && canUpload(role));
  const canManagePublication = canUploadVersion;
  const canCreateCheckout = !!(session && role && canCheckout(role));
  const canSeeCheckouts = !!(session && role && canViewCheckouts(role));
  const isAdmin = !!(session && role && canAdmin(role));

  const map = await prisma.mapFile.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      archivedAt: true,
      versions: {
        where: versionVisibilityFilter(role),
        orderBy: { versionNumber: "desc" },
      },
    },
  });

  if (!map) notFound();

  const mapArchived = isMapArchived(map.archivedAt);
  const checkoutHistory = await findCheckoutHistoryForMap(map.id);

  const activeCheckouts = await findActiveCheckoutsForMap(map.id);
  const headVersionId = await getHeadVersionId(map.id);
  const checkoutListItems = activeCheckouts.map(serializeCheckoutResponse);

  const pendingSuggestionBreakdown =
    session?.user?.id ? await listPendingSuggestionsByVersion(map.id) : [];

  const courseList =
    session?.user?.id && role && canCreateCourse(role)
      ? (await listCoursesForMap(map.id, session.user.id)).map(serializeCourseSummary)
      : [];

  const suggestionList =
    session?.user?.id && role && canCreateMapSuggestion(role)
      ? await (async () => {
          const [rows, latestPublished] = await Promise.all([
            listPendingSuggestionsForMap(map.id),
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
      isRecommended: version.isRecommended,
      uploaderLabel: uploader?.name ?? uploader?.email ?? "—",
      previousVersionId: map.versions[index + 1]?.id,
      canView: role ? canViewVersion(role, version.isPublished) : false,
    };
  });

  const publishedVersions = map.versions.filter((v) => v.isPublished);
  const latestPublishedVersion = publishedVersions[0] ?? null;
  const headVersion = map.versions[0] ?? null;

  if (role && isReader(role) && !latestPublishedVersion) {
    notFound();
  }
  const comparableVersions = versionHistoryItems.filter((v) => v.canView);

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
          {mapArchived && (
            <p className="mt-2 rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-700">
              Detta område är arkiverat. Endast administratörer kan återställa eller radera det.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <MapArchiveButton mapSlug={map.slug} initialArchived={mapArchived} />
          )}
          {canCreateCheckout && !mapArchived && (
            <CheckoutAreaCta
              mapSlug={map.slug}
              canCheckout={canCreateCheckout}
              headVersionId={headVersionId}
            />
          )}
          {session?.user?.id && role && canCreateCourse(role) && !mapArchived && (
            latestPublishedVersion ? (
              <Link
                href={`/maps/${map.slug}/bana`}
                className="rounded-lg bg-ifk-blue px-4 py-2 text-sm font-medium text-white transition hover:bg-ifk-blue/90"
              >
                {courseList.length > 0 ? `Banor (${courseList.length})` : "Lägg bana"}
              </Link>
            ) : (
              <span
                title="Kräver en publicerad kartversion"
                className="cursor-not-allowed rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-500"
              >
                Lägg bana
              </span>
            )
          )}
          {latestPublishedVersion && role && canCreateMapSuggestion(role) && !mapArchived && (
            <Link
              href={`/maps/${map.slug}/versions/${latestPublishedVersion.id}/suggest`}
              className="rounded-lg border border-orange-300 bg-orange-50 px-4 py-2 text-sm font-medium text-orange-800 transition hover:border-orange-400"
            >
              Föreslå ändring
            </Link>
          )}
        </div>
      </div>

      {session?.user?.id && !mapArchived && (
        <AreaStatusBanner
          mapSlug={map.slug}
          headVersionNumber={headVersion?.versionNumber ?? null}
          headVersionId={headVersion?.id ?? headVersionId}
          headIsPublished={headVersion?.isPublished ?? false}
          publishedVersionNumber={latestPublishedVersion?.versionNumber ?? null}
          publishedVersionId={latestPublishedVersion?.id ?? null}
          suggestionBreakdown={pendingSuggestionBreakdown}
          activeCheckoutCount={activeCheckouts.length}
          showVersionStatus={canManagePublication}
          showCheckoutStatus={canSeeCheckouts}
        />
      )}

      {canUploadVersion && !mapArchived && (
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
              isAdmin={isAdmin}
              mapArchived={mapArchived}
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

      <section className="mt-10" id="versionshistorik">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium text-slate-900">
            Versionshistorik ({map.versions.length})
          </h2>
        </div>

        {comparableVersions.length >= 2 && (
          <div className="mt-4">
            <VersionComparePicker
              mapSlug={map.slug}
              versions={comparableVersions.map((v) => ({
                id: v.id,
                versionNumber: v.versionNumber,
                uploadedAt: v.uploadedAt,
                isPublished: v.isPublished,
              }))}
            />
          </div>
        )}

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

      {headVersionId && activeCheckouts.length > 0 && canSeeCheckouts && (
        <section className="mt-10">
          <h2 className="text-lg font-medium text-slate-900">Utcheckningsområden på kartan</h2>
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

      {session?.user?.id && canSeeCheckouts && (
        <>
          <CheckoutListPanel
            mapSlug={map.slug}
            checkouts={checkoutListItems}
            sessionUserId={session.user.id}
            isAdmin={isAdmin}
            canCheckout={canCreateCheckout && !mapArchived}
            headVersionId={headVersionId}
          />
          <CheckoutHistoryPanel
            mapSlug={map.slug}
            items={checkoutHistory.map((row) => ({
              id: row.id,
              status: row.status,
              createdAt: row.createdAt.toISOString(),
              integratedAt: row.integratedAt?.toISOString() ?? null,
              integratedVersionId: row.integratedVersionId,
              user: row.user,
            }))}
          />
        </>
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
