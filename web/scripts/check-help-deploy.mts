/**
 * Pre-deploy check: samma krav som vid commit, men för filer som ska deployas.
 *
 * Körs automatiskt via:
 *   - npm run deploy / deploy:preview (lokalt)
 *   - Vercel buildCommand (git-deploy)
 *
 * Hoppa över: SKIP_HELP_CHECK=1 npm run deploy
 */

import {
  evaluateHelpUpdate,
  getLocalDeployFiles,
  getVercelDeployFiles,
  printHelpCheckFailure,
  shouldSkipHelpCheck,
} from "./lib/help-update-check.mts";

function getDeployFiles(): string[] {
  if (process.env.VERCEL === "1") {
    return getVercelDeployFiles();
  }
  return getLocalDeployFiles();
}

function main(): void {
  if (shouldSkipHelpCheck()) {
    return;
  }

  const files = getDeployFiles();
  const { ok, appChanges } = evaluateHelpUpdate(files);
  if (ok) {
    return;
  }

  printHelpCheckFailure(appChanges, "deploy");
  process.exit(1);
}

main();
