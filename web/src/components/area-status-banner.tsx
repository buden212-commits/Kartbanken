import Link from "next/link";

export type SuggestionVersionBreakdown = {
  versionId: string;
  versionNumber: number;
  open: number;
  inProgress: number;
};

type Props = {
  mapSlug: string;
  /** Senaste (head) version — null om inga versioner. */
  headVersionNumber: number | null;
  headVersionId: string | null;
  headIsPublished: boolean;
  publishedVersionNumber: number | null;
  publishedVersionId: string | null;
  suggestionBreakdown: SuggestionVersionBreakdown[];
  activeCheckoutCount: number;
  /** Visa opublicerad head-version (redaktörer). */
  showVersionStatus: boolean;
  /** Visa utcheckningsstatus (redaktörer och administratörer). */
  showCheckoutStatus?: boolean;
};

function formatSuggestionCounts(open: number, inProgress: number): string {
  const parts: string[] = [];
  if (open > 0) {
    parts.push(`${open} öppna`);
  }
  if (inProgress > 0) {
    parts.push(`${inProgress} pågår`);
  }
  return parts.join(", ");
}

export function AreaStatusBanner({
  mapSlug,
  headVersionNumber,
  headVersionId,
  headIsPublished,
  publishedVersionNumber,
  publishedVersionId,
  suggestionBreakdown,
  activeCheckoutCount,
  showVersionStatus,
  showCheckoutStatus = true,
}: Props) {
  const openSuggestionCount = suggestionBreakdown.reduce((sum, row) => sum + row.open, 0);
  const inProgressSuggestionCount = suggestionBreakdown.reduce(
    (sum, row) => sum + row.inProgress,
    0,
  );
  const pendingSuggestions = openSuggestionCount + inProgressSuggestionCount;
  const unpublishedHead =
    showVersionStatus && headVersionNumber != null && !headIsPublished;

  const shouldShow =
    pendingSuggestions > 0 ||
    unpublishedHead ||
    (showCheckoutStatus && activeCheckoutCount > 0);

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
              {formatSuggestionCounts(openSuggestionCount, inProgressSuggestionCount)} kartförslag
            </Link>
            {suggestionBreakdown.length > 0 && (
              <ul className="mt-1 space-y-0.5 pl-4 text-xs text-amber-900/85">
                {suggestionBreakdown.map((row) => {
                  const appliesToOlder =
                    publishedVersionNumber != null &&
                    row.versionNumber < publishedVersionNumber;
                  return (
                    <li key={row.versionId}>
                      <strong>v{row.versionNumber}</strong>
                      {appliesToOlder && (
                        <span className="text-violet-800"> · gäller äldre version</span>
                      )}
                      {": "}
                      {formatSuggestionCounts(row.open, row.inProgress)}
                    </li>
                  );
                })}
              </ul>
            )}
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

        {showCheckoutStatus && activeCheckoutCount > 0 && (
          <li>
            <Link href={`/maps/${mapSlug}#utcheckningar`} className="text-ifk-blue hover:underline">
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
