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

import {
  evaluateHelpUpdate,
  getStagedFiles,
  printHelpCheckFailure,
  shouldSkipHelpCheck,
} from "./lib/help-update-check.mts";

function main(): void {
  if (shouldSkipHelpCheck()) {
    return;
  }

  const { ok, appChanges } = evaluateHelpUpdate(getStagedFiles());
  if (ok) {
    return;
  }

  printHelpCheckFailure(appChanges, "commit");
  process.exit(1);
}

main();
