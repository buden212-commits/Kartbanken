/**
 * Steg före Vercel-deploy: verifiera att release notes och hjälptext är uppdaterade.
 */

import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));

function main(): void {
  console.log("Kontrollerar release notes och hjälptext före deploy…");
  execSync("npx tsx scripts/check-help-deploy.mts", {
    cwd: join(scriptDir, ".."),
    stdio: "inherit",
  });
  console.log("Hjälpkontroll OK — fortsätter med deploy.");
}

main();
