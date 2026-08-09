import Link from "next/link";
import { auth } from "@/auth";
import { canAdmin } from "@/lib/auth/permissions";
import { countOpenFeedback } from "@/lib/feedback/repository";
import { HelpNav } from "@/components/help-nav";

export default async function HelpHubPage() {
  const session = await auth();
  const isAdmin = !!(session?.user && canAdmin(session.user.role));
  const openCounts = await countOpenFeedback();

  const cards = [
    {
      href: "/hjalp/guide",
      title: "Användarguide",
      description:
        "Kom igång, roller, områden, versioner, utcheckning, banor, kartförslag, jämförelse och export.",
      badge: null,
    },
    {
      href: "/hjalp/buggar",
      title: "Rapportera bugg",
      description:
        "Hittat ett fel i tjänsten? Beskriv problemet så att admin kan åtgärda det.",
      badge: openCounts.bugs > 0 ? `${openCounts.bugs} öppna` : null,
    },
    {
      href: "/hjalp/forbattringar",
      title: "Förbättringsförslag",
      description:
        "Föreslå nya funktioner eller förbättringar. Rösta på andras idéer med tumme upp.",
      badge: openCounts.improvements > 0 ? `${openCounts.improvements} öppna` : null,
    },
    {
      href: "/hjalp/release-notes",
      title: "Release notes",
      description: "Nyheter och ändringar i systemet, sorterade med nyast först.",
      badge: null,
    },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <p className="page-eyebrow">Hjälp</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">Hjälp och support</h1>
      <p className="mt-3 max-w-2xl text-slate-600">
        Guider, release notes och feedback om själva tjänsten — separerat från kartförslag som
        gäller terräng på kartan.
      </p>

      <div className="mt-8">
        <HelpNav active="hub" />
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="card block transition hover:border-ifk-blue/40 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-medium text-ifk-blue">{card.title}</h2>
              {card.badge && (
                <span className="shrink-0 rounded-full bg-ifk-blue-pale px-2 py-0.5 text-xs font-medium text-ifk-blue">
                  {card.badge}
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-slate-600">{card.description}</p>
          </Link>
        ))}
      </div>

      {isAdmin && (
        <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Administratör:{" "}
          <Link href="/admin/feedback" className="link-primary">
            Hantera feedback
          </Link>{" "}
          ({openCounts.total} öppna poster).
        </div>
      )}
    </div>
  );
}
