import Link from "next/link";
import type { ReactNode } from "react";
import { helpSectionLabels, type HelpSectionId } from "@/lib/help/sections";

const iconClass =
  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-500 no-underline transition hover:border-ifk-blue/40 hover:bg-ifk-blue-pale hover:text-ifk-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ifk-blue/30";

type IconProps = {
  section: HelpSectionId;
  className?: string;
  label?: string;
};

export function HelpLinkIcon({ section, className = "", label }: IconProps) {
  const sectionLabel = helpSectionLabels[section];
  return (
    <Link
      href={`/hjalp#${section}`}
      className={`${iconClass} ${className}`.trim()}
      title={`Hjälp: ${sectionLabel}`}
      aria-label={label ?? `Hjälp om ${sectionLabel}`}
    >
      ?
    </Link>
  );
}

export function HelpFormTopBar({ section }: { section: HelpSectionId }) {
  return (
    <div className="-mt-1 mb-2 flex justify-end">
      <HelpLinkIcon section={section} />
    </div>
  );
}

type HeadingProps = {
  section: HelpSectionId;
  children: ReactNode;
  className?: string;
  as?: "h1" | "h2" | "h3";
  id?: string;
};

export function HelpSectionHeading({
  section,
  children,
  className = "text-lg font-medium text-slate-900",
  as: Tag = "h2",
  id,
}: HeadingProps) {
  return (
    <div className="flex items-start justify-between gap-3">
      <Tag id={id} className={className}>
        {children}
      </Tag>
      <HelpLinkIcon section={section} className="mt-0.5 shrink-0" />
    </div>
  );
}
