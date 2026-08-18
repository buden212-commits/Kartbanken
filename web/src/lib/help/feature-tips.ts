import { Role, type Role as RoleType } from "@/lib/roles";
import type { HelpSectionId } from "@/lib/help/sections";

export type FeatureTipRole = typeof Role.READER | typeof Role.EDITOR | typeof Role.ADMIN;

export type FeatureTip = {
  id: string;
  title: string;
  body: string;
  helpSectionId: HelpSectionId;
  href?: string;
  hrefLabel?: string;
  roles: FeatureTipRole[];
  /** Högre värde = visas oftare (standard 5). */
  weight?: number;
  /** Dölj efter detta datum (ISO YYYY-MM-DD). */
  activeUntil?: string;
};

export const featureTips: FeatureTip[] = [
  {
    id: "kartforslag-faltlage",
    title: "Kartförslag i fält",
    body: "Installera appen på telefonen. Utkast och foto sparas om mottagningen dippar och skickas när du är online igen.",
    helpSectionId: "kartforslag",
    roles: [Role.READER, Role.EDITOR, Role.ADMIN],
    weight: 10,
  },
  {
    id: "kartforslag-gps",
    title: "GPS-spår i kartförslag",
    body: "Markera en stig eller spår med telefonens GPS — linjen filtreras och förenklas automatiskt innan den sparas.",
    helpSectionId: "kartforslag",
    roles: [Role.READER, Role.EDITOR, Role.ADMIN],
    weight: 9,
  },
  {
    id: "kartforslag-foto",
    title: "Fota direkt i kartförslag",
    body: "På mobil kan du ta foto i inskick-dialogen när du lämnar ett kartförslag — bilden bifogas förslaget.",
    helpSectionId: "kartforslag",
    roles: [Role.READER, Role.EDITOR, Role.ADMIN],
    weight: 7,
  },
  {
    id: "verifiera",
    title: "Verifiera före uppladdning",
    body: "Jämför två .ocd-filer tillfälligt utan att spara dem som version i systemet.",
    helpSectionId: "verifiera",
    href: "/verifiera",
    hrefLabel: "Öppna Verifiera",
    roles: [Role.READER, Role.EDITOR, Role.ADMIN],
    weight: 8,
  },
  {
    id: "checkout",
    title: "Checka ut ett delområde",
    body: "Reservera en yta på kartan, redigera i OCAD och checka in — andra ser var du arbetar.",
    helpSectionId: "checkout",
    roles: [Role.EDITOR, Role.ADMIN],
    weight: 9,
  },
  {
    id: "bana",
    title: "Lägg bana på kartan",
    body: "Planera orienteringsbanor med IOF-symboler 701–709 — banor påverkar inte själva kartfilen.",
    helpSectionId: "bana",
    roles: [Role.READER, Role.EDITOR, Role.ADMIN],
    weight: 7,
  },
  {
    id: "bana-skuggbana",
    title: "Jämför med skuggbana",
    body: "Visa en annan sparad bana halvtransparent ovanpå din — bra när du planerar varianter.",
    helpSectionId: "bana",
    roles: [Role.READER, Role.EDITOR, Role.ADMIN],
    weight: 5,
  },
  {
    id: "export-utsnitt",
    title: "Exportera kartutsnitt",
    body: "I kartvyn kan du exportera valt område som PDF, OCAD (.ocd) eller GeoTIFF (.tif).",
    helpSectionId: "kartvy",
    roles: [Role.READER, Role.EDITOR, Role.ADMIN],
    weight: 8,
  },
  {
    id: "gps-position",
    title: "Min position på kartan",
    body: "På georefererade kartor visar Min position var du är, zooma till 1:50 och följer dig var 10:e sekund tills du stoppar GPS.",
    helpSectionId: "kartvy",
    roles: [Role.READER, Role.EDITOR, Role.ADMIN],
    weight: 6,
  },
  {
    id: "jamfor-diff",
    title: "Jämför versioner visuellt",
    body: "Diff-vyn visar tillagda, borttagna och ändrade objekt med färgkodning på kartan.",
    helpSectionId: "jamfor",
    roles: [Role.READER, Role.EDITOR, Role.ADMIN],
    weight: 6,
  },
  {
    id: "publicering-en",
    title: "En publicerad version i taget",
    body: "När du publicerar en ny version avpubliceras den tidigare automatiskt — läsare ser alltid rätt karta.",
    helpSectionId: "publicering",
    roles: [Role.EDITOR, Role.ADMIN],
    weight: 7,
  },
  {
    id: "versionsrad-klick",
    title: "Klicka raden i versionshistoriken",
    body: "Hela raden öppnar kartan — version, datum, storlek, uppladdare, kommentar och status. Dokumentikonen efter kommentaren visar kartinformationen från OCAD.",
    helpSectionId: "versioner",
    roles: [Role.READER, Role.EDITOR, Role.ADMIN],
    weight: 4,
  },
  {
    id: "kartforslag-pdf",
    title: "PDF-rapport för kartförslag",
    body: "Exportera alla öppna och pågående kartförslag som PDF med text, foto och kartutklipp.",
    helpSectionId: "kartforslag",
    roles: [Role.READER, Role.EDITOR, Role.ADMIN],
    weight: 6,
  },
  {
    id: "hjalp-process",
    title: "Process-scheman i hjälpen",
    body: "Varje huvudavsnitt på hjälpsidan har flödesschema — öppna Hjälp för att se hur funktionerna hänger ihop.",
    helpSectionId: "oversikt",
    href: "/hjalp",
    hrefLabel: "Öppna Hjälp",
    roles: [Role.READER, Role.EDITOR, Role.ADMIN],
    weight: 3,
    activeUntil: "2026-09-30",
  },
];

function simpleHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function isApprovedRole(role: RoleType): role is FeatureTipRole {
  return role === Role.READER || role === Role.EDITOR || role === Role.ADMIN;
}

function isTipActive(tip: FeatureTip, today: string): boolean {
  return !tip.activeUntil || tip.activeUntil >= today;
}

/** Stabil viktad tips-väljare — samma tips hela dagen per användare. */
export function pickFeatureTip(
  role: RoleType,
  seed: string,
  today = new Date().toISOString().slice(0, 10),
): FeatureTip | null {
  if (!isApprovedRole(role)) return null;

  const eligible = featureTips.filter(
    (tip) => tip.roles.includes(role) && isTipActive(tip, today),
  );
  if (eligible.length === 0) return null;

  const pool = eligible.flatMap((tip) => Array(tip.weight ?? 5).fill(tip));
  return pool[simpleHash(seed) % pool.length] ?? null;
}
