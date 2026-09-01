/**
 * Tar skärmdumpar till docs/sjalvstudier-kursmaterial.md och skriver in dem i texten.
 *
 *   npm run docs:screenshots
 *
 * Miljövariabler:
 *   DOCS_BASE_URL   Adress till körande app (standard http://localhost:3000)
 *   DOCS_EMAIL      Inloggning. Utan denna tas bara sidor som inte kräver inloggning.
 *   DOCS_PASSWORD   Lösenord
 *   DOCS_AREA_SLUG  Tvinga ett visst kartområde i stället för automatiskt val
 *
 * Flaggor:
 *   --only=1.1,2.3  Ta bara vissa bilder
 *   --headed        Visa webbläsaren
 *   --skip-capture  Skriv bara om markdown utifrån bilder som redan finns
 */

import { mkdir, readFile, readdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { chromium, type Browser, type Locator, type Page } from "playwright";
import { courseShots, type CaptureContext, type CourseShot } from "./lib/course-shots.mts";
import { courseDiagrams } from "./lib/course-diagrams.mts";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const docsDir = path.join(repoRoot, "docs");
const imagesDir = path.join(docsDir, "bilder");
const markdownPath = path.join(docsDir, "sjalvstudier-kursmaterial.md");
/** Relativ sökväg från markdownfilen till bildmappen. */
const imagesRelativeDir = "bilder";

const BASE_URL = (process.env.DOCS_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const EMAIL = process.env.DOCS_EMAIL ?? "";
const PASSWORD = process.env.DOCS_PASSWORD ?? "";
const FORCED_AREA_SLUG = process.env.DOCS_AREA_SLUG ?? "";

const args = process.argv.slice(2);
const onlyArg = args.find((a) => a.startsWith("--only="));
const onlyIds = onlyArg ? new Set(onlyArg.slice("--only=".length).split(",").map((s) => s.trim())) : null;
const headed = args.includes("--headed");
const skipCapture = args.includes("--skip-capture");

type ShotOutcome =
  | { id: string; state: "captured"; file: string; clipped: boolean }
  | { id: string; state: "manual"; reason: string }
  | { id: string; state: "skipped"; reason: string }
  | { id: string; state: "failed"; reason: string };

function imageFileName(id: string): string {
  return `${id}.png`;
}

async function existingImages(): Promise<Set<string>> {
  try {
    return new Set(await readdir(imagesDir));
  } catch {
    return new Set();
  }
}

async function login(page: Page): Promise<boolean> {
  if (!EMAIL || !PASSWORD) return false;

  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.getByRole("button", { name: "Logga in" }).click();

  try {
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
  } catch {
    throw new Error(
      "Inloggningen gick inte igenom. Kontrollera DOCS_EMAIL och DOCS_PASSWORD, samt att kontot är godkänt.",
    );
  }
  return true;
}

type ApiVersion = { id: string; versionNumber: number; parseStatus: string };

async function fetchJson<T>(page: Page, url: string): Promise<T | null> {
  try {
    const response = await page.request.get(`${BASE_URL}${url}`);
    if (!response.ok()) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function buildContext(page: Page, authenticated: boolean): Promise<CaptureContext> {
  const ctx: CaptureContext = {
    baseUrl: BASE_URL,
    areaSlug: null,
    areaTitle: null,
    publishedVersionId: null,
    headVersionId: null,
    compareVersions: null,
    checkoutId: null,
    suggestionId: null,
  };

  if (!authenticated) return ctx;

  const maps = await fetchJson<Array<{ slug: string; title: string; latestVersion: ApiVersion | null }>>(
    page,
    "/api/maps",
  );
  if (!maps?.length) return ctx;

  const chosen =
    (FORCED_AREA_SLUG && maps.find((m) => m.slug === FORCED_AREA_SLUG)) ||
    maps.find((m) => m.latestVersion?.parseStatus === "OK") ||
    maps.find((m) => m.latestVersion) ||
    maps[0];

  ctx.areaSlug = chosen.slug;
  ctx.areaTitle = chosen.title;

  const detail = await fetchJson<{ versions: ApiVersion[] }>(page, `/api/maps/${chosen.slug}`);
  const versions = detail?.versions ?? [];
  if (versions.length > 0) {
    ctx.headVersionId = versions[0].id;
    // API:et exponerar inte publiceringsflaggan; senaste versionen fungerar för kartvyn.
    ctx.publishedVersionId = versions[0].id;
  }
  if (versions.length >= 2) {
    const sorted = [...versions].sort((a, b) => a.versionNumber - b.versionNumber);
    ctx.compareVersions = {
      v1: sorted[sorted.length - 2].id,
      v2: sorted[sorted.length - 1].id,
    };
  }

  const checkouts = await fetchJson<Array<{ id: string; status: string }>>(
    page,
    `/api/maps/${chosen.slug}/checkouts`,
  );
  if (Array.isArray(checkouts) && checkouts.length > 0) {
    ctx.checkoutId = (checkouts.find((c) => c.status !== "CANCELLED") ?? checkouts[0]).id;
  }

  const suggestions = await fetchJson<Array<{ id: string }>>(
    page,
    `/api/maps/${chosen.slug}/suggestions`,
  );
  if (Array.isArray(suggestions) && suggestions.length > 0) {
    ctx.suggestionId = suggestions[0].id;
  }

  return ctx;
}

async function settle(page: Page, extraMs: number): Promise<void> {
  try {
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
  } catch {
    // Kartvyer pollar i bakgrunden och blir aldrig helt tysta.
  }
  await page.waitForTimeout(extraMs);
}

async function resolveRegion(page: Page, shot: CourseShot): Promise<Locator | null> {
  if (!shot.region) return null;
  try {
    const locator = shot.region(page);
    if ((await locator.count()) === 0) return null;
    await locator.first().waitFor({ state: "visible", timeout: 5_000 });
    return locator.first();
  } catch {
    return null;
  }
}

async function captureShot(page: Page, shot: CourseShot, ctx: CaptureContext): Promise<ShotOutcome> {
  if (shot.manual) {
    return { id: shot.id, state: "manual", reason: shot.manual };
  }

  const relativeUrl = shot.url?.(ctx) ?? null;
  if (!relativeUrl) {
    return {
      id: shot.id,
      state: "skipped",
      reason: "Nödvändig data saknas i appen (område, version, utcheckning eller kartförslag).",
    };
  }

  const file = path.join(imagesDir, imageFileName(shot.id));

  try {
    const response = await page.goto(`${BASE_URL}${relativeUrl}`, { waitUntil: "domcontentloaded" });
    if (response && response.status() >= 400) {
      return { id: shot.id, state: "skipped", reason: `Sidan svarade ${response.status()}.` };
    }

    // Utan giltig session skickar appen vidare till inloggningen — spara inte den bilden.
    if (!shot.anonymous && new URL(page.url()).pathname.startsWith("/login")) {
      return {
        id: shot.id,
        state: "skipped",
        reason: "Kräver inloggning — sidan skickade vidare till inloggningen.",
      };
    }

    await settle(page, shot.settleMs ?? 1200);

    if (shot.prepare) {
      try {
        await shot.prepare(page, ctx);
      } catch {
        return {
          id: shot.id,
          state: "skipped",
          reason: "Förberedande klick gick inte att utföra — knappen eller dialogen saknas.",
        };
      }
      await page.waitForTimeout(600);
    }

    const region = await resolveRegion(page, shot);
    if (region) {
      await region.screenshot({ path: file });
      return { id: shot.id, state: "captured", file, clipped: true };
    }

    await page.screenshot({ path: file });
    return { id: shot.id, state: "captured", file, clipped: false };
  } catch (err) {
    return {
      id: shot.id,
      state: "failed",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

function renderMarkdownBlock(shot: CourseShot, hasImage: boolean): string {
  const inner = hasImage
    ? `![${shot.description}](${imagesRelativeDir}/${imageFileName(shot.id)})\n\n*Bild ${shot.id} — ${shot.description}*`
    : `**[BILD ${shot.id}]** ${shot.description}${shot.manual ? `\n\n> Tas för hand: ${shot.manual}` : ""}`;

  return `<!-- bild:${shot.id} -->\n${inner}\n<!-- /bild:${shot.id} -->`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderDiagramBlock(key: string, title: string, chart: string): string {
  return [
    `<!-- diagram:${key} -->`,
    `**${title}**`,
    "",
    "```mermaid",
    chart.trim(),
    "```",
    `<!-- /diagram:${key} -->`,
  ].join("\n");
}

async function updateMarkdown(available: Set<string>): Promise<number> {
  let markdown = await readFile(markdownPath, "utf-8");
  let updated = 0;

  for (const diagram of courseDiagrams) {
    const key = escapeRegExp(diagram.key);
    const pattern = new RegExp(`<!-- diagram:${key} -->[\\s\\S]*?<!-- /diagram:${key} -->`);
    if (pattern.test(markdown)) {
      markdown = markdown.replace(
        pattern,
        renderDiagramBlock(diagram.key, diagram.title, diagram.chart),
      );
    }
  }

  for (const shot of courseShots) {
    const block = renderMarkdownBlock(shot, available.has(imageFileName(shot.id)));
    const id = escapeRegExp(shot.id);
    const markerPattern = new RegExp(`<!-- bild:${id} -->[\\s\\S]*?<!-- /bild:${id} -->`);
    const placeholderPattern = new RegExp(`^\\*\\*\\[BILD ${id}\\]\\*\\*.*$`, "m");

    if (markerPattern.test(markdown)) {
      markdown = markdown.replace(markerPattern, block);
      updated += 1;
    } else if (placeholderPattern.test(markdown)) {
      markdown = markdown.replace(placeholderPattern, block);
      updated += 1;
    }
  }

  await writeFile(markdownPath, markdown, "utf-8");
  return updated;
}

function reportLine(outcome: ShotOutcome): string {
  switch (outcome.state) {
    case "captured":
      return `  ✓ ${outcome.id.padEnd(5)} sparad${outcome.clipped ? "" : " (hela sidan — inget delområde hittades)"}`;
    case "manual":
      return `  ✎ ${outcome.id.padEnd(5)} tas för hand: ${outcome.reason}`;
    case "skipped":
      return `  – ${outcome.id.padEnd(5)} hoppades över: ${outcome.reason}`;
    case "failed":
      return `  ✗ ${outcome.id.padEnd(5)} misslyckades: ${outcome.reason}`;
  }
}

async function main(): Promise<void> {
  await mkdir(imagesDir, { recursive: true });

  if (skipCapture) {
    const updated = await updateMarkdown(await existingImages());
    console.log(`Markdown uppdaterad för ${updated} bildplatser (inga nya skärmdumpar togs).`);
    return;
  }

  const shots = courseShots.filter((shot) => !onlyIds || onlyIds.has(shot.id));
  if (shots.length === 0) {
    console.error("Inga bilder matchade --only.");
    process.exitCode = 1;
    return;
  }

  console.log(`Adress: ${BASE_URL}`);

  let browser: Browser | null = null;
  const outcomes: ShotOutcome[] = [];

  try {
    browser = await chromium.launch({ headless: !headed });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      locale: "sv-SE",
      timezoneId: "Europe/Stockholm",
    });
    const page = await context.newPage();

    const authenticated = await login(page);
    if (!authenticated) {
      console.log(
        "Ingen inloggning angiven (DOCS_EMAIL/DOCS_PASSWORD) — bara öppna sidor kan fångas.",
      );
    }

    const ctx = await buildContext(page, authenticated);
    if (ctx.areaSlug) {
      console.log(`Använder området «${ctx.areaTitle ?? ctx.areaSlug}» (${ctx.areaSlug}).`);
    }
    console.log("");

    for (const shot of shots) {
      const outcome = await captureShot(page, shot, ctx);
      outcomes.push(outcome);
      console.log(reportLine(outcome));
    }

    await context.close();
  } finally {
    await browser?.close();
  }

  const updated = await updateMarkdown(await existingImages());

  const captured = outcomes.filter((o) => o.state === "captured").length;
  const manual = outcomes.filter((o) => o.state === "manual");
  const skipped = outcomes.filter((o) => o.state === "skipped");
  const failed = outcomes.filter((o) => o.state === "failed");

  console.log("");
  console.log(
    `Klart: ${captured} bilder sparade i docs/${imagesRelativeDir}, ${updated} bildplatser uppdaterade i kursmaterialet.`,
  );
  if (manual.length > 0) {
    console.log(
      `${manual.length} bilder tas för hand — lägg filen som docs/${imagesRelativeDir}/<id>.png och kör skriptet igen med --skip-capture.`,
    );
  }
  if (skipped.length > 0) {
    console.log(`${skipped.length} hoppades över (saknad data eller åtkomst).`);
  }
  if (failed.length > 0) {
    console.log(`${failed.length} misslyckades — se listan ovan.`);
    process.exitCode = 1;
  }
}

void main();
