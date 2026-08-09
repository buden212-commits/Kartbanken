import Link from "next/link";

type Props = {
  mapSlug: string;
  /** Senaste (head) version — null om inga versioner. */
  headVersionNumber: number | null;
  headVersionId: string | null;
  headIsPublished: boolean;
  publishedVersionNumber: number | null;
  publishedVersionId: string | null;
  openSuggestionCount: number;
  inProgressSuggestionCount: number;
  activeCheckoutCount: number;
  /** Visa opublicerad head-version (redaktörer). */
  showVersionStatus: boolean;
};

function formatSuggestionLine(open: number, inProgress: number): string {
  const parts: string[] = [];
  if (open > 0) {
    parts.push(`${open} öppna`);
  }
  if (inProgress > 0) {
    parts.push(`${inProgress} pågår`);
  }
  return `${parts.join(", ")} kartförslag`;
}

export function AreaStatusBanner({
  mapSlug,
  headVersionNumber,
  headVersionId,
  headIsPublished,
  publishedVersionNumber,
  publishedVersionId,
  openSuggestionCount,
  inProgressSuggestionCount,
  activeCheckoutCount,
  showVersionStatus,
}: Props) {
  const pendingSuggestions = openSuggestionCount + inProgressSuggestionCount;
  const unpublishedHead =
    showVersionStatus && headVersionNumber != null && !headIsPublished;

  const shouldShow =
    pendingSuggestions > 0 || unpublishedHead || activeCheckoutCount > 0;

  if (!shouldShow) {
    return null;
  }

  const compareHref =
    unpublishedHead &&
    headVersionId &&
    (publishedVersionId ?? headVersionId)
      ? publishedVersionId
        ? `/maps/${mapSlug}/compare?v1=${publishedVersionId}&v2=${headVersionId}`
        : null
      : null;

  return (
    <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-4 text-sm text-amber-950">
      <p className="font-medium">Kräver uppmärksamhet</p>
      <ul className="mt-2 space-y-1.5 text-amber-900/90">
        {pendingSuggestions > 0 && (
          <li>
            <Link href={`/maps/${mapSlug}#kartforslag`} className="text-ifk-blue hover:underline">
              {formatSuggestionLine(openSuggestionCount, inProgressSuggestionCount)}
            </Link>
          </li>
        )}

        {unpublishedHead && (
          <li>
            {publishedVersionNumber != null ? (
              <>
                Senaste version{" "}
                <Link
                  href={`/maps/${mapSlug}/versions/${headVersionId}`}
                  className="font-medium text-ifk-blue hover:underline"
                >
                  v{headVersionNumber}
                </Link>{" "}
                är inte publicerad — läsare ser{" "}
                <strong>v{publishedVersionNumber}</strong>
                {compareHref && (
                  <>
                    {" · "}
                    <Link href={compareHref} className="text-ifk-blue hover:underline">
                      Jämför
                    </Link>
                  </>
                )}
              </>
            ) : (
              <>
                Ingen version är publicerad — senaste är{" "}
                <Link
                  href={`/maps/${mapSlug}/versions/${headVersionId}`}
                  className="font-medium text-ifk-blue hover:underline"
                >
                  v{headVersionNumber}
                </Link>
              </>
            )}
          </li>
        )}

        {activeCheckoutCount > 0 && (
          <li>
            <Link href={`/maps/${mapSlug}#checkouts`} className="text-ifk-blue hover:underline">
              {activeCheckoutCount === 1
                ? "1 utcheckat område"
                : `${activeCheckoutCount} utcheckade områden`}
            </Link>
          </li>
        )}
      </ul>
    </div>
  );
}
