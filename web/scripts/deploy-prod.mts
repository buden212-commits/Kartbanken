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

/** Publik produktionsalias som alltid ska peka på senaste --prod-deploy. */
const PRODUCTION_ALIASES = ["web-ebon-eight-72.vercel.app"] as const;

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

const orgId = process.env.VERCEL_ORG_ID ?? project.orgId;
const projectId = process.env.VERCEL_PROJECT_ID ?? project.projectId;

const env = {
  ...process.env,
  VERCEL_TOKEN: token,
  VERCEL_ORG_ID: orgId,
  VERCEL_PROJECT_ID: projectId,
};

const result = spawnSync(
  "npx",
  ["vercel", "deploy", "--prod", "--yes", "--token", token],
  { cwd: root, env, stdio: "inherit", shell: process.platform === "win32" },
);

if ((result.status ?? 1) !== 0) {
  process.exit(result.status ?? 1);
}

async function assignProductionAliases(): Promise<void> {
  const listUrl = new URL("https://api.vercel.com/v6/deployments");
  listUrl.searchParams.set("projectId", projectId);
  listUrl.searchParams.set("teamId", orgId);
  listUrl.searchParams.set("limit", "1");
  listUrl.searchParams.set("target", "production");

  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!listRes.ok) {
    throw new Error(`Kunde inte hämta senaste deploy (${listRes.status})`);
  }

  const listJson = (await listRes.json()) as {
    deployments?: Array<{ uid?: string; url?: string }>;
  };
  const latest = listJson.deployments?.[0];
  if (!latest?.uid) {
    throw new Error("Ingen production-deploy hittades efter uppladdning");
  }

  for (const alias of PRODUCTION_ALIASES) {
    const aliasUrl = new URL(`https://api.vercel.com/v2/deployments/${latest.uid}/aliases`);
    aliasUrl.searchParams.set("teamId", orgId);
    const aliasRes = await fetch(aliasUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ alias }),
    });
    if (!aliasRes.ok) {
      const body = await aliasRes.text();
      throw new Error(`Kunde inte sätta alias ${alias} (${aliasRes.status}): ${body}`);
    }
    console.log(`Alias OK: https://${alias} → ${latest.url ?? latest.uid}`);
  }
}

try {
  await assignProductionAliases();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
