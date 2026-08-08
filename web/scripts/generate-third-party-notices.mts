import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const csv = execSync("npx --yes license-checker --production --csv", {
  cwd: root,
  encoding: "utf8",
  stdio: ["pipe", "pipe", "ignore"],
});

type Row = { name: string; license: string; repository: string };

const rows: Row[] = csv
  .trim()
  .split("\n")
  .slice(1)
  .map((line) => {
    const match = line.match(/^"([^"]+)","([^"]*)","([^"]*)"/);
    if (!match) return null;
    return { name: match[1], license: match[2], repository: match[3] };
  })
  .filter((row): row is Row => row !== null)
  .sort((a, b) => a.name.localeCompare(b.name, "sv"));

const directNames = new Set([
  "@auth/prisma-adapter",
  "@prisma/client",
  "@vercel/blob",
  "bcryptjs",
  "geotiff",
  "jspdf",
  "mermaid",
  "next",
  "next-auth",
  "nodemailer",
  "ocad2geojson",
  "proj4",
  "react",
  "react-dom",
  "sharp",
]);

function packageBase(name: string): string {
  if (name.startsWith("@")) {
    const parts = name.split("@");
    return `@${parts[1]}`;
  }
  return name.replace(/@.+$/, "");
}

const licenseCounts = new Map<string, number>();
for (const row of rows) {
  licenseCounts.set(row.license, (licenseCounts.get(row.license) ?? 0) + 1);
}

const special = rows.filter((row) => /AGPL|LGPL|GPL|MPL|CC-BY/i.test(row.license));
const direct = rows.filter((row) => directNames.has(packageBase(row.name)));

const generatedAt = new Date().toISOString().slice(0, 10);

const notices = `# THIRD_PARTY_NOTICES

> kartor.ifkmora.se (web) — tredjepartsprogramvara och licenser  
> Genererad: ${generatedAt}  
> Detta dokument ersätter inte juridisk rådgivning.

Applikationen **web** (IFK Mora OK, privat) bygger på öppen källkod och kommersiella tjänster.
Vid distribution eller vidarelicensiering måste villkoren för respektive licens följas.

## Sammanfattning (produktion, ${rows.length} paket)

| Licens | Antal paket |
|--------|-------------|
${[...licenseCounts.entries()]
  .sort((a, b) => b[1] - a[1])
  .map(([license, count]) => `| ${license} | ${count} |`)
  .join("\n")}

## Direkta beroenden (package.json)

| Paket | Licens | Källa |
|-------|--------|-------|
${direct.map((row) => `| ${row.name} | ${row.license} | ${row.repository || "—"} |`).join("\n")}

## Särskild uppmärksamhet vid distribution

Följande produktionsberoenden har licenser som **kräver extra granskning**:

| Paket | Licens | Användning i appen | Distribution |
|-------|--------|-------------------|--------------|
${special
  .map((row) => {
    const usage: Record<string, string> = {
      "ocad2geojson@2.1.23":
        "Server-side OCAD-parsing, SVG-preview, diff, export (kärnfunktion)",
      "@img/sharp-win32-x64@0.35.3":
        "Native bildrasterisering (sharp) — GeoTIFF, kartförslags-PDF",
      "caniuse-lite@1.0.30001806":
        "Build-time webbläsardata (Browserslist) — ingår normalt inte i körbar produkt",
      "dompurify@3.4.12":
        "HTML-sanering (transitivt via mermaid/jspdf) — välj Apache-2.0-alternativet",
    };
    const note: Record<string, string> = {
      "ocad2geojson@2.1.23":
        "**AGPL-3.0:** Kräver källkodstillgång eller separat licens. Kontakta upphovsmann.",
      "@img/sharp-win32-x64@0.35.3":
        "**LGPL-3.0** (tillsammans med Apache-2.0): Native module — följ LGPL vid vidaredistribution av binaries.",
      "caniuse-lite@1.0.30001806":
        "**CC-BY-4.0:** Attribution vid vidaredistribution av datan (låg risk i SaaS).",
      "dompurify@3.4.12":
        "**MPL-2.0 OR Apache-2.0:** Använd Apache-2.0-spåret.",
    };
    return `| ${row.name} | ${row.license} | ${usage[row.name] ?? "Se fullständig lista"} | ${note[row.name] ?? "Granska licensvillkor"} |`;
  })
  .join("\n")}

### ocad2geojson (AGPL-3.0-or-later)

Detta är den **viktigaste licensfrågan** för hela systemet. Biblioteket används på serversidan
för att läsa och bearbeta \`.ocd\`-filer. AGPL kan kräva att mottagare av nätverkstjänsten erbjuds
motsvarande källkod. Alternativ: förhandla om kommersiell licens med upphovsmannen
([github.com/perliedman/ocad2geojson](https://github.com/perliedman/ocad2geojson)) eller ersätt biblioteket.

## Extern infrastruktur (ej npm)

| Tjänst | Leverantör | Avtal |
|--------|------------|-------|
| Hosting / serverless | Vercel | Vercel ToS / kommersiellt |
| PostgreSQL | Neon | Neon ToS / kommersiellt |
| Fillagring (prod) | Vercel Blob | Vercel ToS |
| E-post | Gmail SMTP | Google ToS |
| Typsnitt | Geist via \`next/font\` | SIL Open Font License (OFL) |

## Applikationens egen kod

Projektet \`web\` är markerat \`private\` i \`package.json\` och har **ingen publicerad OSS-licens**.
Upphovsrätt tillhör IFK Mora OK / projektägaren om inget annat avtalats.

## Fullständig lista (produktion)

| Paket | Licens | Repository |
|-------|--------|------------|
${rows.map((row) => `| ${row.name} | ${row.license} | ${row.repository || "—"} |`).join("\n")}

---

*Generera om denna fil efter större dependency-uppdateringar:*

\`\`\`bash
cd web
npx tsx scripts/generate-third-party-notices.mts
\`\`\`
`;

const csvOut = ["module name,license,repository", ...rows.map((r) => `"${r.name}","${r.license}","${r.repository}"`)].join(
  "\n",
);

writeFileSync(join(root, "THIRD_PARTY_NOTICES.md"), notices, "utf8");
writeFileSync(join(root, "..", "docs", "third-party-licenses.csv"), csvOut, "utf8");
console.log(`Wrote THIRD_PARTY_NOTICES.md (${rows.length} packages)`);
console.log("Wrote docs/third-party-licenses.csv");
