import { HelpPageContent } from "@/components/help-page-content";
import { HelpLinkIcon } from "@/components/help-link-icon";

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <p className="page-eyebrow">Hjälp</p>
      <div className="mt-2 flex min-w-0 items-center gap-2">
        <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">
          Så fungerar kartor.ifkmora.se
        </h1>
        <HelpLinkIcon section="oversikt" />
      </div>
      <p className="mt-3 max-w-2xl text-slate-600">
        Guide till områden, versionshantering, checkout, jämförelse och export av orienteringskartor.
      </p>

      <div className="mt-10">
        <HelpPageContent />
      </div>
    </div>
  );
}
