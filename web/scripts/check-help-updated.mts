/**
 * Pre-commit check: app-ändringar under web/ ska åtföljas av uppdaterad hjälp.
 *
 * Uppdatera minst en av:
 *   - web/src/lib/help/release-notes.ts
 *   - web/src/components/help-page-content.tsx
 *
 * Hoppa över: SKIP_HELP_CHECK=1 git commit ...
 * Nödfall: git commit --no-verify
 */

import { execSync } from "node:child_process";

const HELP_FILES = new Set([
  "web/src/lib/help/release-notes.ts",
  "web/src/components/help-page-content.tsx",
]);

const TRIGGER_PREFIXES = ["web/src/", "web/prisma/migrations/"];

function normalizePath(file: string): string {
  return file.replace(/\\/g, "/");
}

function getStagedFiles(): string[] {
  const output = execSync("git diff --cached --name-only", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return output
    .split(/\r?\n/)
    .map(normalizePath)
    .filter(Boolean);
}

function isTriggerFile(file: string): boolean {
  if (HELP_FILES.has(file)) return false;
  if (file === "web/src/components/help-release-notes.tsx") return false;
  return TRIGGER_PREFIXES.some((prefix) => file.startsWith(prefix));
}

function main(): void {
  if (process.env.SKIP_HELP_CHECK === "1") {
    return;
  }

  const staged = getStagedFiles();
  const appChanges = staged.filter(isTriggerFile);
  if (appChanges.length === 0) {
    return;
  }

  const helpUpdated = staged.some((file) => HELP_FILES.has(file));
  if (helpUpdated) {
    return;
  }

  console.error("");
  console.error("Commit avbruten: hjälpen måste uppdateras.");
  console.error("");
  console.error("Detta commit innehåller app-ändringar under web/ men ingen hjälpfil är med.");
  console.error("Uppdatera minst en av:");
  console.error("  • web/src/lib/help/release-notes.ts  (release notes)");
  console.error("  • web/src/components/help-page-content.tsx  (hjälptext)");
  console.error("");
  console.error("Exempel på ändrade filer som kräver hjälpuppdatering:");
  for (const file of appChanges.slice(0, 8)) {
    console.error(`  • ${file}`);
  }
  if (appChanges.length > 8) {
    console.error(`  • … och ${appChanges.length - 8} till`);
  }
  console.error("");
  console.error("Hoppa över kontrollen: SKIP_HELP_CHECK=1 git commit ...");
  console.error("Eller: git commit --no-verify");
  console.error("");
  process.exit(1);
}

main();
