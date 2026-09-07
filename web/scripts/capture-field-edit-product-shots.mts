/**
 * UI-skärmdumpar av Fältredigering till public/produkt/faltredigering/.
 *
 *   DOCS_BASE_URL=… DATABASE_URL=… npx tsx scripts/capture-field-edit-product-shots.mts
 */
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { chromium, type Locator, type Page } from "playwright";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { Role } from "../src/lib/roles";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(scriptDir, "../public/produkt/faltredigering");
const BASE_URL = (process.env.DOCS_BASE_URL ?? "https://web-ebon-eight-72.vercel.app").replace(
  /\/$/,
  "",
);

const TEMP_EMAIL = "produktblad-shots@kartbanken.local";
const TEMP_PASSWORD = `shots-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const MAP_SLUG = process.env.DOCS_AREA_SLUG ?? "sprint-tomteland";

const prisma = new PrismaClient();

async function ensureTempUser(): Promise<string> {
  const passwordHash = await hashPassword(TEMP_PASSWORD);
  const user = await prisma.user.upsert({
    where: { email: TEMP_EMAIL },
    create: {
      email: TEMP_EMAIL,
      name: "Skärmdump",
      passwordHash,
      role: Role.ADMIN,
      approvedAt: new Date(),
      canFieldEdit: true,
      mustChangePassword: false,
    },
    update: {
      name: "Skärmdump",
      passwordHash,
      role: Role.ADMIN,
      approvedAt: new Date(),
      canFieldEdit: true,
      mustChangePassword: false,
    },
  });
  return user.id;
}

async function cleanupTempUser(userId: string, sessionId: string | null) {
  if (sessionId) {
    try {
      await prisma.mapCheckout.update({
        where: { id: sessionId },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelledById: userId,
          cancelReason: "Produktblad-skärmdumpar (tillfällig session)",
        },
      });
      console.log("Avbröt tillfällig session", sessionId);
    } catch (e) {
      console.warn("Kunde inte avbryta session:", e);
    }
  }
  try {
    await prisma.mapCheckout.deleteMany({ where: { userId } });
    await prisma.auditLog.deleteMany({ where: { userId } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: userId } });
    console.log("Raderade temp-användare", TEMP_EMAIL);
  } catch (e) {
    console.warn("Kunde inte radera temp-användare:", e);
  }
}

async function login(page: Page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", TEMP_EMAIL);
  await page.fill("#password", TEMP_PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 45_000 });
}

async function settle(page: Page, ms = 4000) {
  try {
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
  } catch {
    // ignore
  }
  await page.waitForTimeout(ms);
}

async function mapPanel(page: Page): Promise<Locator> {
  return page.locator("div").filter({ has: page.getByRole("button", { name: "Hela kartan" }) }).first();
}

async function shotFull(page: Page, name: string) {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, type: "png" });
  console.log("Skrev", file);
}

async function shotRegion(page: Page, name: string, locator: Locator) {
  const file = path.join(outDir, `${name}.png`);
  try {
    await locator.screenshot({ path: file, type: "png" });
    console.log("Skrev (region)", file);
  } catch {
    await page.screenshot({ path: file, type: "png" });
    console.log("Skrev (fallback full)", file);
  }
}

async function readViewBoxRing(page: Page): Promise<[number, number][]> {
  const vb = await page.evaluate(() => {
    const svg = document.querySelector("svg");
    if (!svg) return null;
    const raw = svg.getAttribute("viewBox");
    if (!raw) return null;
    return raw.split(/[\s,]+/).map(Number);
  });
  if (!vb || vb.length !== 4 || vb.some((n) => Number.isNaN(n))) {
    throw new Error("Kunde inte läsa SVG viewBox");
  }
  const [vx, vy, vw, vh] = vb;
  const cx = vx + vw * 0.5;
  const cy = vy + vh * 0.5;
  const s = Math.min(vw, vh) * 0.05;
  return [
    [cx - s, cy - s],
    [cx + s, cy - s],
    [cx + s, cy + s],
    [cx - s, cy + s],
  ];
}

async function createFieldEdit(page: Page, ring: [number, number][]): Promise<string> {
  const response = await page.request.post(`${BASE_URL}/api/maps/${MAP_SLUG}/field-edits`, {
    data: {
      selectionType: "POLYGON",
      selection: { geometry: { type: "POLYGON", ring } },
    },
  });
  const body = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
  if (!response.ok() || !body.id) {
    throw new Error(`Skapa fältredigering misslyckades (${response.status()}): ${JSON.stringify(body)}`);
  }
  return body.id;
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const userId = await ensureTempUser();
  let sessionId: string | null = null;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  try {
    await login(page);
    console.log("Inloggad");

    // --- Skapa område ---
    await page.goto(`${BASE_URL}/maps/${MAP_SLUG}/field-edit`, { waitUntil: "domcontentloaded" });
    await settle(page, 7000);
    const hela = page.getByRole("button", { name: "Hela kartan" });
    if (await hela.count()) {
      await hela.click();
      await page.waitForTimeout(2500);
    }
    await shotFull(page, "ui-skapa");
    await shotRegion(page, "ui-skapa-karta", await mapPanel(page));

    const ring = await readViewBoxRing(page);
    sessionId = await createFieldEdit(page, ring);
    console.log("Session", sessionId, "ring", ring);

    await page.goto(`${BASE_URL}/maps/${MAP_SLUG}/field-edit/${sessionId}`, {
      waitUntil: "domcontentloaded",
    });
    await settle(page, 12_000);
    if (await hela.count()) {
      await hela.click();
      await page.waitForTimeout(4000);
    }

    await shotFull(page, "ui-editor");
    await shotRegion(page, "ui-editor-karta", await mapPanel(page));

    // Rita: linjeverktyg + symbolväljare
    const drawBtn = page.getByRole("button", { name: /Rita och redigera/i }).first();
    if (await drawBtn.count()) await drawBtn.click();
    await page.waitForTimeout(400);
    const lineBtn = page.getByRole("button", { name: /^Linje/i }).first();
    if (await lineBtn.count()) await lineBtn.click();
    await page.waitForTimeout(1200);
    await shotFull(page, "ui-rita");
    await shotRegion(page, "ui-rita-karta", await mapPanel(page));

    // GPS-verktyg synligt i verktygsrad
    const toolbar = page.locator('[aria-label="Fältredigeringsverktyg"]').first();
    await shotFull(page, "ui-gps");
    if (await toolbar.count()) {
      await shotRegion(page, "ui-gps-verktyg", toolbar);
    }

    // Yta/CAD-läge
    const areaBtn = page.getByRole("button", { name: /^Yta/i }).first();
    if (await areaBtn.count()) await areaBtn.click();
    await page.waitForTimeout(800);
    await shotFull(page, "ui-cad");
    await shotRegion(page, "ui-cad-karta", await mapPanel(page));

    // Incheckning / granskning
    const pending = await prisma.mapCheckout.findFirst({
      where: { mode: "FIELD_EDIT", status: "PENDING_ADMIN_CONFIRM" },
      select: { id: true, mapFile: { select: { slug: true } } },
    });
    if (pending) {
      await page.goto(`${BASE_URL}/maps/${pending.mapFile.slug}/field-edit/${pending.id}`, {
        waitUntil: "domcontentloaded",
      });
      await settle(page, 8000);
      await shotFull(page, "ui-incheckning");
      await shotRegion(page, "ui-incheckning-karta", await mapPanel(page));
    }

    await writeFile(
      path.join(outDir, "ui-shots.json"),
      JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          baseUrl: BASE_URL,
          mapSlug: MAP_SLUG,
          sessionId,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
    await cleanupTempUser(userId, sessionId);
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
