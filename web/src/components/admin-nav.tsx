import Link from "next/link";

type AdminNavProps = {
  active: "users" | "loggning" | "settings";
};

const links = [
  { href: "/admin/users", key: "users" as const, label: "Användare" },
  { href: "/admin/loggning", key: "loggning" as const, label: "Loggning" },
  { href: "/admin/settings", key: "settings" as const, label: "Inställningar" },
];

export function AdminNav({ active }: AdminNavProps) {
  return (
    <nav className="mt-6 flex flex-wrap gap-2 border-b border-slate-200 pb-4">
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
