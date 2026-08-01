import { readdir } from "fs/promises";
import path from "path";
import { compareOcadFiles } from "../src/lib/ocad/compare";
import { findExampleOcdFile, getRepoRoot } from "../src/lib/ocad/read";

async function main() {
  const repoRoot = getRepoRoot();
  const exampleDir = path.join(repoRoot, "Exempelfil");
  const files = (await readdir(exampleDir)).filter((f) => f.toLowerCase().endsWith(".ocd"));

  if (files.length === 0) {
    throw new Error("Ingen .ocd-fil i Exempelfil/");
  }

  const fileA = await findExampleOcdFile(repoRoot);
  const fileB = files.length >= 2 ? path.join(exampleDir, files[1]!) : fileA;

  console.log("Jämför:");
  console.log("  A:", path.basename(fileA));
  console.log("  B:", path.basename(fileB));
  if (fileA === fileB) {
    console.log("  (samma fil — förväntat: 0 ändringar)\n");
  } else {
    console.log("");
  }

  const diff = await compareOcadFiles(fileA, fileB);

  console.log("═".repeat(60));
  console.log(`Diff klar på ${(diff.durationMs / 1000).toFixed(2)} s (tolerans ${diff.toleranceMeters} m)\n`);
  console.log(`  Tillagda:    ${diff.added.toLocaleString("sv-SE")}`);
  console.log(`  Borttagna:   ${diff.removed.toLocaleString("sv-SE")}`);
  console.log(`  Ändrade:     ${diff.modified.toLocaleString("sv-SE")}`);
  console.log(`  Oförändrade: ${diff.unchanged.toLocaleString("sv-SE")}`);

  if (diff.bySymbol.length > 0) {
    console.log("\nTopp symboler med ändringar:");
    for (const row of diff.bySymbol.slice(0, 10)) {
      console.log(
        `  ${row.symbolNumber} ${row.symbolName.slice(0, 35).padEnd(35)} +${row.added} -${row.removed} ~${row.modified}`,
      );
    }
  }

  if (diff.changes.length > 0 && diff.changes.length <= 10) {
    console.log("\nExempel på ändringar:");
    for (const change of diff.changes.slice(0, 5)) {
      const label =
        change.changeType === "added"
          ? "TILLAGD"
          : change.changeType === "removed"
            ? "BORTTAGEN"
            : "ÄNDRAD";
      console.log(
        `  [${label}] ${change.symbolNumber} ${change.symbolName} @ (${change.centroid[0].toFixed(1)}, ${change.centroid[1].toFixed(1)})`,
      );
    }
  }

  if (diff.added === 0 && diff.removed === 0 && diff.modified === 0) {
    console.log("\n✓ Inga skillnader hittades.");
  }
}

main().catch((err) => {
  console.error("Diff misslyckades:", err);
  process.exit(1);
});
