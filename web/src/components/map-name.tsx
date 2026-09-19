import Link from "next/link";
import { MapTypeIcon } from "@/components/map-type-icon";

type MapNameProps = {
  title: string;
  areaType?: string | null;
  className?: string;
  iconClassName?: string;
};

export function MapName({ title, areaType, className, iconClassName }: MapNameProps) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className ?? ""}`}>
      <MapTypeIcon areaType={areaType} className={iconClassName ?? "h-5 w-5"} />
      <span className="min-w-0 truncate">{title}</span>
    </span>
  );
}

type MapBackLinkProps = {
  href: string;
  title: string;
  areaType?: string | null;
  className?: string;
};

export function MapBackLink({
  href,
  title,
  areaType,
  className = "link-muted text-sm",
}: MapBackLinkProps) {
  return (
    <Link href={href} className={`inline-flex items-center gap-1.5 ${className}`}>
      <span aria-hidden="true">←</span>
      <MapName title={title} areaType={areaType} />
    </Link>
  );
}
