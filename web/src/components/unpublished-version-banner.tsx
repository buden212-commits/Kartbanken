"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export type UnpublishedVersionItem = {
  id: string;
  versionNumber: number;
  parseStatus: string;
  previousVersionId?: string;
};

type Props = {
  mapSlug: string;
  publishedVersionNumber: number | null;
  publishedVersionId: string | null;
  unpublishedVersions: UnpublishedVersionItem[];
  canManage: boolean;
};

function formatVersionList(numbers: number[]): string {
  return numbers.map((n) => `v${n}`).join(", ");
}

export function UnpublishedVersionBanner({
  mapSlug,
  publishedVersionNumber,
  publishedVersionId,
  unpublishedVersions,
  canManage,
}: Props) {
  const router = useRouter();
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const publishTarget = useMemo(
    () =>
      unpublishedVersions.reduce<UnpublishedVersionItem | null>(
        (best, version) =>
          !best || version.versionNumber > best.versionNumber ? version : best,
        null,
      ),
    [unpublishedVersions],
  );

  if (!canManage || unpublishedVersions.length === 0 || !publishTarget) {
    return null;
  }

  const canPublishTarget = publishTarget.parseStatus === "OK";
  const compareHref =
    publishedVersionId != null
      ? `/maps/${mapSlug}/compare?v1=${publishedVersionId}&v2=${publishTarget.id}`
      : publishTarget.previousVersionId
        ? `/maps/${mapSlug}/compare?v1=${publishTarget.previousVersionId}&v2=${publishTarget.id}`
        : null;

  async function publishTargetVersion() {
    if (!canPublishTarget) return;

    const replaceText =
      publishedVersionNumber != null
        ? `v${publishTarget!.versionNumber} ersätter v${publishedVersionNumber} för läsare.`
        : `v${publishTarget!.versionNumber} blir synlig för läsare.`;

    if (
      !window.confirm(
        `Publicera v${publishTarget!.versionNumber}?\n\n${replaceText}\n\nKontrollera gärna diff innan du publicerar.`,
      )
    ) {
      return;
    }

    setPublishing(true);
    setError(null);

    const res = await fetch(`/api/maps/${mapSlug}/versions/${publishTarget!.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublished: true }),
    });

    setPublishing(false);

    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "Kunde inte publicera");
      return;
    }

    router.refresh();
  }

  return (
    <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-4 text-sm text-amber-950">
      <p className="font-medium">
        {unpublishedVersions.length === 1
          ? "1 opublicerad version väntar granskning"
          : `${unpublishedVersions.length} opublicerade versioner väntar granskning`}
      </p>

      <p className="mt-2 text-amber-900/90">
        Opublicerade:{" "}
        {unpublishedVersions.map((version, index) => (
          <span key={version.id}>
            {index > 0 && ", "}
            <Link
              href={`/maps/${mapSlug}/versions/${version.id}`}
              className="font-medium text-ifk-blue hover:underline"
            >
              v{version.versionNumber}
            </Link>
          </span>
        ))}
      </p>

      {publishTarget.parseStatus !== "OK" && (
        <p className="mt-2 text-amber-900/90">
          {formatVersionList([publishTarget.versionNumber])}{" "}
          {publishTarget.parseStatus === "ERROR"
            ? "har parsningsfel och kan inte publiceras ännu."
            : "parsas fortfarande — vänta tills parsningen är klar."}
        </p>
      )}

      {publishedVersionNumber != null && (
        <p className="mt-2 text-amber-900/90">
          Läsare ser just nu <strong>v{publishedVersionNumber}</strong>.
          {publishTarget.versionNumber !== publishedVersionNumber && (
            <>
              {" "}
              Senaste opublicerade är <strong>v{publishTarget.versionNumber}</strong>.
            </>
          )}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {compareHref && (
          <Link
            href={compareHref}
            className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-950 hover:bg-amber-50"
          >
            Jämför v{publishTarget.versionNumber}
            {publishedVersionNumber != null ? ` med v${publishedVersionNumber}` : " med föregående"}
          </Link>
        )}
        <button
          type="button"
          disabled={publishing || !canPublishTarget}
          onClick={() => void publishTargetVersion()}
          className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
          title={
            !canPublishTarget
              ? publishTarget.parseStatus === "ERROR"
                ? "Parsningsfel"
                : "Parsning pågår"
              : undefined
          }
        >
          {publishing ? "Publicerar…" : `Publicera v${publishTarget.versionNumber}`}
        </button>
        <Link
          href={`/maps/${mapSlug}#versionshistorik`}
          className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm text-amber-950 hover:bg-amber-50"
        >
          Versionshistorik
        </Link>
      </div>

      <p className="mt-3 text-xs text-amber-800/90">
        Publicera den version som ska gälla för läsare (vanligtvis den senaste opublicerade).
        Äldre opublicerade versioner kan ligga kvar som historik.
      </p>

      {error && (
        <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
