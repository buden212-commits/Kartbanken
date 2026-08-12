#!/usr/bin/env npx tsx
/**
 * Produktiondeploy till Vercel.
 *
 * Kräver miljövariabeln VERCEL_TOKEN (Cursor Secret eller GitHub Actions secret).
 * Skapa token: https://vercel.com/account/tokens
 *
 * Användning:
 *   npm run deploy:prod
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const project = JSON.parse(
  readFileSync(join(root, ".vercel", "project.json"), "utf8"),
) as { projectId: string; orgId: string; projectName: string };

const token = process.env.VERCEL_TOKEN?.trim();
if (!token) {
  console.error(`
Saknar VERCEL_TOKEN.

Engångsinställning:
  1. Skapa token på https://vercel.com/account/tokens (scope: Full Account eller Deploy)
  2. Lägg till som Cursor Secret «VERCEL_TOKEN» (Runtime Secret):
     https://cursor.com/dashboard/cloud-agents
  3. Lägg till samma token som GitHub Actions secret «VERCEL_TOKEN» i repot
     (Settings → Secrets and variables → Actions)

Därefter fungerar: npm run deploy:prod
`);
  process.exit(1);
}

const env = {
  ...process.env,
  VERCEL_TOKEN: token,
  VERCEL_ORG_ID: process.env.VERCEL_ORG_ID ?? project.orgId,
  VERCEL_PROJECT_ID: process.env.VERCEL_PROJECT_ID ?? project.projectId,
};

const result = spawnSync(
  "npx",
  ["vercel", "deploy", "--prod", "--yes", "--token", token],
  { cwd: root, env, stdio: "inherit", shell: process.platform === "win32" },
);

process.exit(result.status ?? 1);
