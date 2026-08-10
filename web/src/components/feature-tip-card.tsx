import Link from "next/link";
import type { FeatureTip } from "@/lib/help/feature-tips";
import { helpSectionHref } from "@/lib/help/sections";

type Props = {
  tip: FeatureTip;
};

export function FeatureTipCard({ tip }: Props) {
  return (
    <aside
      className="rounded-xl border border-ifk-blue/25 bg-ifk-blue-pale px-4 py-3 sm:px-5 sm:py-4"
      aria-labelledby={`feature-tip-${tip.id}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-ifk-blue/80">
        Visste du att…
      </p>
      <h2 id={`feature-tip-${tip.id}`} className="mt-1 text-base font-semibold text-slate-900">
        {tip.title}
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-slate-700">{tip.body}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <Link
          href={helpSectionHref(tip.helpSectionId)}
          className="link-primary font-medium"
        >
          Läs mer i hjälpen →
        </Link>
        {tip.href && tip.hrefLabel && (
          <Link href={tip.href} className="font-medium text-slate-600 hover:text-ifk-blue">
            {tip.hrefLabel} →
          </Link>
        )}
      </div>
    </aside>
  );
}
