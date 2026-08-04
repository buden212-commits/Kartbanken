"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

type Props = {
  mapSlug: string;
  versionId: string;
  versionNumber: number;
  previousVersionId?: string;
  canView: boolean;
  canDelete?: boolean;
};

const iconBtn =
  "group relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition hover:border-ifk-blue/40 hover:bg-ifk-blue-pale hover:text-ifk-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ifk-blue/30 disabled:pointer-events-none disabled:opacity-50";
const iconBtnDanger =
  "group relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200 disabled:pointer-events-none disabled:opacity-50";
const tooltip =
  "pointer-events-none absolute left-1/2 top-full z-20 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-800 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-sm transition group-hover:opacity-100 group-focus-visible:opacity-100";

function Tooltip({ label }: { label: string }) {
  return (
    <span role="tooltip" className={tooltip}>
      {label}
    </span>
  );
}

function IconLink({
  href,
  label,
  external,
  className,
  children,
}: {
  href: string;
  label: string;
  external?: boolean;
  className: string;
  children: ReactNode;
}) {
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        className={className}
      >
        {children}
        <Tooltip label={label} />
      </a>
    );
  }

  return (
    <Link href={href} aria-label={label} className={className}>
      {children}
      <Tooltip label={label} />
    </Link>
  );
}

function DownloadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
      <path
        d="M10 3v9m0 0 3.5-3.5M10 12 6.5 8.5M4 14.5v1.5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CompareIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
      <path
        d="M6.5 7 4 9.5l2.5 2.5M13.5 7 16 9.5 13.5 12M4.5 9.5h11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
      <path
        d="M11 4h5v5M16 4 9 11M8 6H5.5A1.5 1.5 0 0 0 4 7.5v8A1.5 1.5 0 0 0 5.5 17h8a1.5 1.5 0 0 0 1.5-1.5V13"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
      <path
        d="M4.5 6h11M8 6V4.5h4V6M7 6v9.5h6V6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function VersionHistoryActions({
  mapSlug,
  versionId,
  versionNumber,
  previousVersionId,
  canView,
  canDelete = false,
}: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    const confirmed = window.confirm(
      `Radera version v${versionNumber}? Detta kan inte ångras.`,
    );
    if (!confirmed) return;

    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/maps/${mapSlug}/versions/${versionId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Radering misslyckades");
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Radering misslyckades");
    } finally {
      setDeleting(false);
    }
  }

  if (!canView) {
    return <span className="text-xs text-slate-400">Ej tillgänglig för läsare</span>;
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <div className="flex flex-nowrap items-center gap-0.5">
        <IconLink
          href={`/maps/${mapSlug}/versions/${versionId}/viewer`}
          label="Öppna i nytt fönster"
          external
          className={iconBtn}
        >
          <ExternalIcon />
        </IconLink>
        {previousVersionId && (
          <IconLink
            href={`/maps/${mapSlug}/compare?v1=${previousVersionId}&v2=${versionId}`}
            label="Jämför med föregående version"
            className={iconBtn}
          >
            <CompareIcon />
          </IconLink>
        )}
        <IconLink
          href={`/api/maps/${mapSlug}/versions/${versionId}/download`}
          label="Ladda ner"
          className={iconBtn}
        >
          <DownloadIcon />
        </IconLink>
        {canDelete && (
          <button
            type="button"
            aria-label="Radera version"
            disabled={deleting}
            onClick={() => void handleDelete()}
            className={iconBtnDanger}
          >
            <TrashIcon />
            <Tooltip label={deleting ? "Raderar…" : "Radera version"} />
          </button>
        )}
      </div>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
