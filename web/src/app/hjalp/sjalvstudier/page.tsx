import Link from "next/link";
import { CourseMaterialContent } from "@/components/course-material-content";
import { HelpNav } from "@/components/help-nav";
import { loadCourseMaterialSegments } from "@/lib/help/parse-course-material";

export default function HelpCourseMaterialPage() {
  const segments = loadCourseMaterialSegments();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <p className="page-eyebrow">Hjälp · Självstudier</p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">
            Självstudier — Kartbanken
          </h1>
          <p className="mt-3 max-w-2xl text-slate-600">
            Kursmaterial med övningar och användarfall för läsare, redaktörer och administratörer.
          </p>
        </div>
        <a
          href="/kursmaterial/sjalvstudier-kursmaterial.pdf"
          className="btn-secondary whitespace-nowrap"
          download
        >
          Ladda ner PDF
        </a>
      </div>

      <div className="mt-8">
        <HelpNav active="sjalvstudier" />
      </div>

      <p className="mt-6 text-sm text-slate-600">
        Vill du slå upp en funktion snabbt? Se även{" "}
        <Link href="/hjalp/guide" className="link-primary">
          guiden
        </Link>
        .
      </p>

      <div className="mt-10">
        <CourseMaterialContent segments={segments} />
      </div>
    </div>
  );
}
