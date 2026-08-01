import { parseOcadFile, findExampleOcdFile, getRepoRoot } from "../src/lib/ocad/read";

async function main() {
  const repoRoot = getRepoRoot();
  const filePath = await findExampleOcdFile(repoRoot);

  console.log(`Parsar: ${filePath}`);
  console.log("—".repeat(60));

  const summary = await parseOcadFile(filePath);

  console.log(`Fil:              ${summary.fileName}`);
  console.log(`Storlek:          ${(summary.fileSizeBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Parsningstid:     ${(summary.parseDurationMs / 1000).toFixed(2)} s`);
  console.log(`OCAD-version:     ${summary.ocadVersion}`);
  console.log(`Antal objekt:     ${summary.objectCount}`);
  console.log(`Antal symboler:   ${summary.symbolCount}`);
  console.log(`Varningar:        ${summary.warnings.length}`);

  if (summary.warnings.length > 0) {
    console.log("\nFörsta varningar:");
    for (const warning of summary.warnings.slice(0, 5)) {
      console.log(`  - ${warning}`);
    }
  }

  console.log("\nObjekt per typ:");
  for (const [type, count] of Object.entries(summary.byType)) {
    if (count > 0) console.log(`  ${type.padEnd(8)} ${count}`);
  }

  console.log("\nTopp 10 symboler:");
  for (const symbol of summary.topSymbols.slice(0, 10)) {
    console.log(
      `  ${String(symbol.symbolNumber).padStart(5)}  ${symbol.symbolName.slice(0, 40).padEnd(40)}  ${symbol.count}`,
    );
  }

  if (summary.bounds) {
    console.log(`\nKartgräns: [${summary.bounds.map((n) => n.toFixed(2)).join(", ")}]`);
  }

  console.log("\nPoC lyckades — ocad2geojson kan läsa filen.");
}

main().catch((error) => {
  console.error("PoC misslyckades:", error);
  process.exit(1);
});
