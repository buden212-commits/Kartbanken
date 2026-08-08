import Link from "next/link";

type Props = {
  mapSlug: string;
  headVersionNumber: number;
  headIsPublished: boolean;
  publishedVersionNumber: number | null;
  unpublishedCount: number;
  canManage: boolean;
};

export function UnpublishedVersionBanner({
  mapSlug,
  headVersionNumber,
  headIsPublished,
  publishedVersionNumber,
  unpublishedCount,
  canManage,
}: Props) {
  if (!canManage || unpublishedCount === 0) return null;

  const headDiffersFromPublished =
    publishedVersionNumber != null &&
    !headIsPublished &&
    headVersionNumber !== publishedVersionNumber;

  return (
    <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
      <p className="font-medium">
        {unpublishedCount === 1
          ? "1 opublicerad version väntar granskning"
          : `${unpublishedCount} opublicerade versioner väntar granskning`}
      </p>
      {headDiffersFromPublished && (
        <p className="mt-1 text-amber-900/90">
          Senaste versionen är v{headVersionNumber} (opublicerad).
          {publishedVersionNumber != null && (
            <> Läsare ser v{publishedVersionNumber}.</>
          )}
        </p>
      )}
      {!headIsPublished && (
        <p className="mt-2">
          <Link href={`/maps/${mapSlug}#versionshistorik`} className="font-medium text-ifk-blue hover:underline">
            Gå till versionshistorik
          </Link>
          {" "}och kryssa i Publicerad när kartan är granskad.
        </p>
      )}
    </div>
  );
}
