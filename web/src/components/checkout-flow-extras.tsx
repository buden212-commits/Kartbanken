"use client";

import Link from "next/link";

type Props = {
  mapSlug: string;
  versionId: string;
  versionNumber: number;
  previousVersionId: string | null;
  canManagePublication: boolean;
};

export function PostIntegrationCta({
  mapSlug,
  versionId,
  versionNumber,
  previousVersionId,
  canManagePublication,
}: Props) {
  return (
    <section className="card border-emerald-200 bg-emerald-50/40">
      <h2 className="text-lg font-medium text-emerald-950">Integrerad som v{versionNumber}</h2>
      <p className="mt-2 text-sm text-emerald-900/90">
        En ny kartversion har skapats. Den är <strong>opublicerad</strong> — läsare ser inte
        ändringarna förrän du publicerar versionen.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {previousVersionId && (
          <Link
            href={`/maps/${mapSlug}/compare?v1=${previousVersionId}&v2=${versionId}`}
            className="rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-50"
          >
            Jämför med föregående
          </Link>
        )}
        <Link
          href={`/maps/${mapSlug}/versions/${versionId}`}
          className="rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-50"
        >
          Visa version
        </Link>
        {canManagePublication && (
          <Link
            href={`/maps/${mapSlug}#versionshistorik`}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
          >
            Publicera i versionshistorik
          </Link>
        )}
      </div>
    </section>
  );
}

export function SubsetDownloadNotice() {
  return (
    <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50/80 px-3 py-2 text-sm text-sky-950">
      <p className="font-medium">Om utcheckningsfilen</p>
      <p className="mt-1 text-sky-900/90">
        Filen genereras av systemet och är inte identisk med en export från OCAD Desktop. Öppna
        filen i OCAD, granska innehållet och spara innan du redigerar. Redigera bara objekt inom
        det utcheckade området.
      </p>
    </div>
  );
}

type VersionContextProps = {
  baseVersionNumber: number;
  baseVersionPublished: boolean;
  headVersionNumber: number;
  headVersionPublished: boolean;
  publishedVersionNumber: number | null;
};

export function CheckoutVersionContextBanner({
  baseVersionNumber,
  baseVersionPublished,
  headVersionNumber,
  headVersionPublished,
  publishedVersionNumber,
}: VersionContextProps) {
  const headChanged = headVersionNumber !== baseVersionNumber;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
      <p>
        <span className="font-medium text-slate-900">Utcheckning baserad på:</span> v
        {baseVersionNumber}
        {baseVersionPublished ? " (publicerad)" : " (opublicerad)"}
      </p>
      <p className="mt-1">
        <span className="font-medium text-slate-900">Aktuell version:</span> v{headVersionNumber}
        {headVersionPublished ? " (publicerad)" : " (opublicerad)"}
        {publishedVersionNumber != null && !headVersionPublished && (
          <> · Läsare ser v{publishedVersionNumber}</>
        )}
      </p>
      {headChanged && (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-900">
          Aktuell version har ändrats sedan utcheckningen skapades. Diff och integration utgår från v
          {headVersionNumber}.
        </p>
      )}
    </div>
  );
}
