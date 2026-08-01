import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { readOcad, ocadToGeoJson } = require("ocad2geojson") as {
  readOcad: (
    input: Buffer,
    options?: { quietWarnings?: boolean },
  ) => Promise<{
    objects: Array<{ sym: number; objType: number; text?: string; coordinates?: unknown[] }>;
    symbols: Array<{ symNum: number; description?: string }>;
  }>;
  ocadToGeoJson: (
    ocadFile: unknown,
    options?: { applyCrs?: boolean },
  ) => { features: Array<{ properties: { sym: number } }> };
};

const IGNORED_SYMBOLS = [850000, 850001, 1200005, 1303000, 1303001, 1304005];

async function main() {
  const exampleDir = path.resolve(process.cwd(), "..", "Exempelfil");
  const fileName = fs.readdirSync(exampleDir).find((f) => f.endsWith(".ocd"));
  if (!fileName) throw new Error("Ingen .ocd-fil hittades");

  const filePath = path.join(exampleDir, fileName);
  const ocad = await readOcad(fs.readFileSync(filePath), { quietWarnings: true });

  const symbolTable = new Map(
    ocad.symbols.map((s) => [s.symNum, s.description?.trim() || `Symbol ${s.symNum}`]),
  );

  const rawCounts = new Map<number, number>();
  for (const obj of ocad.objects) {
    rawCounts.set(obj.sym, (rawCounts.get(obj.sym) ?? 0) + 1);
  }

  const geojson = ocadToGeoJson(ocad, { applyCrs: true });
  const parsedCounts = new Map<number, number>();
  for (const feature of geojson.features) {
    const sym = feature.properties.sym;
    parsedCounts.set(sym, (parsedCounts.get(sym) ?? 0) + 1);
  }

  console.log(`Fil: ${fileName}\n`);
  console.log("═".repeat(60));
  console.log("Symboldefinitioner som gav varning\n");

  for (const symNum of IGNORED_SYMBOLS) {
    const inTable = symbolTable.has(symNum);
    const desc = inTable ? symbolTable.get(symNum) : "(saknas i symboltabell)";
    console.log(`  ${symNum}: ${inTable ? "finns i filen" : "finns INTE"} — ${desc}`);
  }

  console.log("\n" + "═".repeat(60));
  console.log("Kartobjekt som använder dessa symboler\n");

  let totalIgnoredRaw = 0;
  for (const symNum of IGNORED_SYMBOLS) {
    const raw = rawCounts.get(symNum) ?? 0;
    const parsed = parsedCounts.get(symNum) ?? 0;
    totalIgnoredRaw += raw;
    const desc = symbolTable.get(symNum) ?? "?";
    console.log(`  ${symNum} (${desc})`);
    console.log(`    Råa OCAD-objekt:     ${raw}`);
    console.log(`    Efter parsning:      ${parsed}`);
    console.log("");
  }

  const totalRaw = ocad.objects.length;
  const totalParsed = geojson.features.length;
  const diff = totalRaw - totalParsed;

  console.log("═".repeat(60));
  console.log("Sammanfattning\n");
  console.log(`  Totalt råa objekt:              ${totalRaw.toLocaleString("sv-SE")}`);
  console.log(`  Totalt parsade objekt:          ${totalParsed.toLocaleString("sv-SE")}`);
  console.log(`  Objekt med varnade symboler:    ${totalIgnoredRaw.toLocaleString("sv-SE")}`);
  console.log(`  Andel varnade symboler:         ${((totalIgnoredRaw / totalRaw) * 100).toFixed(3)}%`);
  console.log(`  Övriga objekt som saknas i export: ${Math.max(0, diff - totalIgnoredRaw).toLocaleString("sv-SE")}`);

  const withExamples = IGNORED_SYMBOLS.filter((n) => (rawCounts.get(n) ?? 0) > 0);
  if (withExamples.length > 0) {
    console.log("\n" + "═".repeat(60));
    console.log("Exempel på objekt med varnade symboler\n");
    for (const symNum of withExamples) {
      const examples = ocad.objects.filter((o) => o.sym === symNum).slice(0, 2);
      console.log(`  Symbol ${symNum} (${symbolTable.get(symNum) ?? "?"}):`);
      for (const ex of examples) {
        const text = ex.text ? `, text="${ex.text.slice(0, 50)}"` : "";
        console.log(
          `    - objType=${ex.objType}, ${ex.coordinates?.length ?? 0} koord${text}`,
        );
      }
      console.log("");
    }
  } else {
    console.log("\n✓ Inga kartobjekt använder de varnade symbolerna.");
    console.log("  Varningarna gäller bara symboldefinitioner i filen, inte terrängobjekt.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
