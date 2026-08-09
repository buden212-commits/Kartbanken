import { HelpReleaseNotes } from "@/components/help-release-notes";
import { HelpNav } from "@/components/help-nav";

export default function HelpReleaseNotesPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <p className="page-eyebrow">Hjälp</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">Release notes</h1>
      <p className="mt-3 text-slate-600">
        Större tillägg och förändringar i kartor.ifkmora.se, sorterade med nyast först.
      </p>

      <div className="mt-8">
        <HelpNav active="release-notes" />
      </div>

      <div className="mt-10">
        <HelpReleaseNotes />
      </div>
    </div>
  );
}
