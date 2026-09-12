import Link from "next/link";

export type HelpNavKey =
  | "hub"
  | "guide"
  | "sjalvstudier"
  | "buggar"
  | "forbattringar"
  | "release-notes";

const links: { href: string; key: HelpNavKey; label: string }[] = [
  { href: "/hjalp", key: "hub", label: "Översikt" },
  { href: "/hjalp/guide", key: "guide", label: "Guide" },
  { href: "/hjalp/sjalvstudier", key: "sjalvstudier", label: "Självstudier" },
  { href: "/hjalp/buggar", key: "buggar", label: "Rapportera bugg" },
  { href: "/hjalp/forbattringar", key: "forbattringar", label: "Förbättringsförslag" },
  { href: "/hjalp/release-notes", key: "release-notes", label: "Release notes" },
];

export function HelpNav({ active }: { active: HelpNavKey }) {
  return (
    <nav className="flex flex-wrap gap-2 border-b border-slate-200 pb-4">
      {links.map((link) => (
        <Link
          key={link.key}
          href={link.href}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            active === link.key
              ? "bg-ifk-blue text-white"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
