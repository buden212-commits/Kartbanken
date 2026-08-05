import { HelpPageContent } from "@/components/help-page-content";

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <p className="page-eyebrow">Hjälp</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">
        Så fungerar kartor.ifkmora.se
      </h1>
      <p className="mt-3 max-w-2xl text-slate-600">
        Guide till områden, versionshantering, checkout, jämförelse och export av orienteringskartor.
      </p>

      <div className="mt-10">
        <HelpPageContent />
      </div>
    </div>
  );
}
