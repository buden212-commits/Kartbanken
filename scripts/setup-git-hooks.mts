import { execSync } from "node:child_process";
import { chmodSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
const hooksDir = join(root, ".githooks");
const preCommit = join(hooksDir, "pre-commit");

if (!existsSync(preCommit)) {
  console.error("Saknar .githooks/pre-commit");
  process.exit(1);
}

try {
  chmodSync(preCommit, 0o755);
} catch {
  // Windows may ignore chmod; Git Bash still runs the hook if executable bit is set in repo.
}

execSync("git config core.hooksPath .githooks", { cwd: root, stdio: "inherit" });
console.log("Git hooks aktiverade (core.hooksPath = .githooks)");
