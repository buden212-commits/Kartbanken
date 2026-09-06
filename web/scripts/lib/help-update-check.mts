import { execSync } from "node:child_process";

export const HELP_FILES = new Set([
  "web/src/lib/help/release-notes.ts",
  "web/src/components/help-page-content.tsx",
]);

export const TRIGGER_PREFIXES = ["web/src/", "web/prisma/migrations/"];

const HELP_FILE_LIST = [...HELP_FILES];

export function normalizePath(file: string): string {
  return file.replace(/\\/g, "/");
}

export function isTriggerFile(file: string): boolean {
  if (HELP_FILES.has(file)) return false;
  if (file === "web/src/components/help-release-notes.tsx") return false;
  return TRIGGER_PREFIXES.some((prefix) => file.startsWith(prefix));
}

function runGit(command: string): string {
  return execSync(command, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function isGitAvailable(): boolean {
  try {
    runGit("git rev-parse --is-inside-work-tree");
    return true;
  } catch {
    return false;
  }
}

function splitLines(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map(normalizePath)
    .filter(Boolean);
}

function addFiles(target: Set<string>, command: string): void {
  try {
    for (const file of splitLines(runGit(command))) {
      target.add(file);
    }
  } catch {
    // Command may fail when range is empty or ref is missing.
  }
}

export function getStagedFiles(): string[] {
  return splitLines(runGit("git diff --cached --name-only"));
}

/** Filer som ingår i en lokal deploy (ostaged, staged och ej pushade commits). */
export function getLocalDeployFiles(): string[] {
  const files = new Set<string>();
  addFiles(files, "git diff HEAD --name-only");
  addFiles(files, "git diff --cached --name-only");
  addFiles(files, "git diff origin/main...HEAD --name-only");
  return [...files];
}

/** Filer som ändrats mellan två commits (t.ex. på Vercel). */
export function getFilesBetweenCommits(fromSha: string, toSha: string): string[] {
  const files = new Set<string>();
  addFiles(files, `git diff ${fromSha} ${toSha} --name-only`);
  return [...files];
}

export function getVercelDeployFiles(): string[] {
  if (!isGitAvailable()) {
    // Vercel CLI-deploy laddar upp filer utan .git — kontrollen kördes redan lokalt.
    return [];
  }

  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  if (!commitSha) {
    return [];
  }

  const previousSha = process.env.VERCEL_GIT_PREVIOUS_SHA?.trim();
  if (previousSha) {
    return getFilesBetweenCommits(previousSha, commitSha);
  }

  try {
    const parentSha = runGit(`git rev-parse ${commitSha}^`);
    return getFilesBetweenCommits(parentSha, commitSha);
  } catch {
    return splitLines(runGit(`git diff-tree --no-commit-id --name-only -r ${commitSha}`));
  }
}

export type HelpCheckResult = {
  ok: boolean;
  appChanges: string[];
  helpUpdated: boolean;
};

export function evaluateHelpUpdate(files: string[]): HelpCheckResult {
  const appChanges = files.filter(isTriggerFile);
  const helpUpdated = files.some((file) => HELP_FILES.has(file));
  const ok = appChanges.length === 0 || helpUpdated;
  return { ok, appChanges, helpUpdated };
}

export function printHelpCheckFailure(
  appChanges: string[],
  context: "commit" | "deploy",
): void {
  console.error("");
  if (context === "commit") {
    console.error("Commit avbruten: hjälpen måste uppdateras.");
  } else {
    console.error("Deploy avbruten: release notes och/eller hjälptext måste uppdateras.");
  }
  console.error("");
  console.error("Detta steg innehåller app-ändringar under web/ men ingen hjälpfil är med.");
  console.error("Uppdatera minst en av:");
  for (const file of HELP_FILE_LIST) {
    const label = file.endsWith("release-notes.ts") ? "release notes" : "hjälptext";
    console.error(`  • ${file}  (${label})`);
  }
  console.error("");
  console.error("Exempel på ändrade filer som kräver hjälpuppdatering:");
  for (const file of appChanges.slice(0, 8)) {
    console.error(`  • ${file}`);
  }
  if (appChanges.length > 8) {
    console.error(`  • … och ${appChanges.length - 8} till`);
  }
  console.error("");
  if (context === "commit") {
    console.error("Hoppa över kontrollen: SKIP_HELP_CHECK=1 git commit ...");
    console.error("Eller: git commit --no-verify");
  } else {
    console.error("Hoppa över kontrollen: SKIP_HELP_CHECK=1 npm run deploy");
    console.error("Använd alltid: npm run deploy  (kör hjälpkontroll automatiskt)");
  }
  console.error("");
}

export function shouldSkipHelpCheck(): boolean {
  return process.env.SKIP_HELP_CHECK === "1";
}
