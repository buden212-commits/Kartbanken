import { auth } from "@/auth";
import { roleLabel } from "@/lib/auth/permissions";
import { HelpExportPdfButton } from "@/components/help-export-pdf-button";
import { HelpPageContent } from "@/components/help-page-content";
import { HelpLinkIcon } from "@/components/help-link-icon";
import { HelpNav } from "@/components/help-nav";

export default async function HelpGuidePage() {
  const session = await auth();
  const userLabel = session?.user
    ? `Exporterad för ${session.user.name?.trim() || session.user.email} (${roleLabel(session.user.role)})`
    : undefined;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <p className="page-eyebrow">Hjälp · Guide</p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">
              Så fungerar kartor.ifkmora.se
            </h1>
            <HelpLinkIcon section="oversikt" />
          </div>
          <p className="mt-3 max-w-2xl text-slate-600">
            Fullständig guide till områden, versionshantering, checkout, jämförelse och export.
          </p>
        </div>
        <HelpExportPdfButton userLabel={userLabel} />
      </div>

      <div className="mt-8">
        <HelpNav active="guide" />
      </div>

      <div className="mt-10">
        <HelpPageContent />
      </div>
    </div>
  );
}
