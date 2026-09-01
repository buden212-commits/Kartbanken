import type { Locator, Page } from "playwright";

/** Uppgifter som hittas i den körande appen innan bilderna tas. */
export type CaptureContext = {
  baseUrl: string;
  areaSlug: string | null;
  areaTitle: string | null;
  publishedVersionId: string | null;
  headVersionId: string | null;
  compareVersions: { v1: string; v2: string } | null;
  checkoutId: string | null;
  suggestionId: string | null;
};

export type CourseShot = {
  id: string;
  part: 1 | 2 | 3;
  /** Bildtext i kursmaterialet. Manifestet är den enda källan för texten. */
  description: string;
  /**
   * Satt när bilden kräver ett tillstånd som inte kan skapas utan att ändra
   * riktig data (t.ex. arkivera ett område). Skriptet hoppar över den och
   * beskriver i stället hur du tar den för hand.
   */
  manual?: string;
  /** Sidan kräver ingen inloggning och ska inte behandlas som utloggningsfel. */
  anonymous?: boolean;
  /** Adress att besöka. Returnera null när nödvändig data saknas. */
  url?: (ctx: CaptureContext) => string | null;
  /** Klick och liknande innan bilden tas. */
  prepare?: (page: Page, ctx: CaptureContext) => Promise<void>;
  /** Beskär till ett område. Faller tillbaka till hela sidan om det inte hittas. */
  region?: (page: Page) => Locator;
  /** Extra väntetid i ms för tunga kartvyer. */
  settleMs?: number;
};

const sectionWithHeading = (page: Page, name: RegExp): Locator =>
  page.locator("section").filter({ has: page.getByRole("heading", { name }) }).first();

const areaActionBar = (page: Page): Locator =>
  page.locator("div").filter({ has: page.getByRole("link", { name: /^(Lägg bana|Banor \()/ }) }).last();

export const courseShots: CourseShot[] = [
  {
    id: "1.1",
    part: 1,
    description: "Inloggningssidan med flikarna «Logga in» och «Skapa konto».",
    url: () => "/login",
    anonymous: true,
  },
  {
    id: "1.2",
    part: 1,
    description:
      "Profildialogen: behörighet «Läsare», kryssrutor för e-postnotiser, byt lösenord.",
    url: () => "/",
    prepare: async (page) => {
      await page.locator('button[title$="öppna profil"]').first().click();
      await page.getByRole("dialog").first().waitFor({ state: "visible" });
    },
    region: (page) => page.getByRole("dialog").first(),
  },
  {
    id: "2.1",
    part: 1,
    description: "Startsidan med lista över kartområden (namn, senaste version, datum).",
    url: () => "/",
  },
  {
    id: "2.2",
    part: 1,
    description: "Områdessidan: versionshistorik med en rad markerad som «Publicerad».",
    url: (ctx) => (ctx.areaSlug ? `/maps/${ctx.areaSlug}#versionshistorik` : null),
    region: (page) => page.locator("#versionshistorik"),
  },
  {
    id: "2.3",
    part: 1,
    description: "Kartvyn i webbläsaren: karta, zoomkontroller, lagerpanel.",
    url: (ctx) =>
      ctx.areaSlug && ctx.publishedVersionId
        ? `/maps/${ctx.areaSlug}/versions/${ctx.publishedVersionId}`
        : null,
    settleMs: 6000,
  },
  {
    id: "3.1",
    part: 1,
    description: "Områdessidan: knappen «Föreslå ändring» i sidhuvudet bredvid andra åtgärder.",
    url: (ctx) => (ctx.areaSlug ? `/maps/${ctx.areaSlug}` : null),
    region: areaActionBar,
  },
  {
    id: "3.2",
    part: 1,
    description:
      "Kartförslagsvyn: ritverktyg till höger, «Skicka in» uppe till höger, karta i mitten.",
    url: (ctx) =>
      ctx.areaSlug && ctx.publishedVersionId
        ? `/maps/${ctx.areaSlug}/versions/${ctx.publishedVersionId}/suggest`
        : null,
    settleMs: 6000,
  },
  {
    id: "3.3",
    part: 1,
    description: "Lista över kartförslag med status (t.ex. «Väntar på granskning»).",
    url: (ctx) => (ctx.areaSlug ? `/maps/${ctx.areaSlug}` : null),
    region: (page) => sectionWithHeading(page, /Kartförslag/),
  },
  {
    id: "4.1",
    part: 1,
    description:
      "Områdessidan: knapparna «Arkivera», «Checka ut», «Lägg bana»/«Banor (2)», «Föreslå ändring».",
    url: (ctx) => (ctx.areaSlug ? `/maps/${ctx.areaSlug}` : null),
    region: areaActionBar,
  },
  {
    id: "4.2",
    part: 1,
    description:
      "Banredigeraren: verktygsrad (Rita, Flytta, Klipp, Radera), kontrollista, symbolpanel.",
    url: (ctx) => (ctx.areaSlug ? `/maps/${ctx.areaSlug}/bana` : null),
    settleMs: 8000,
  },
  {
    id: "4.3",
    part: 1,
    description: "Bana med kontrollcirkel och lucka (Klipp) — kartsymbol syns genom luckan.",
    manual:
      "Öppna en bana, välj verktyget Klipp, klicka på en kontrollcirkel som ligger över en kartsymbol och zooma in innan du tar bilden.",
  },
  {
    id: "4.4",
    part: 1,
    description: "(Valfritt) Skuggbana vald i rullgardinsmenyn, halvtransparent overlay.",
    manual: "Kräver minst två sparade banor på samma område. Välj skuggbana i rullgardinsmenyn.",
  },
  {
    id: "5.1",
    part: 1,
    description: "Exportdialog i kartvyn med val av format (PDF / OCAD / GeoTIFF).",
    url: (ctx) =>
      ctx.areaSlug && ctx.publishedVersionId
        ? `/maps/${ctx.areaSlug}/versions/${ctx.publishedVersionId}`
        : null,
    settleMs: 6000,
    prepare: async (page) => {
      await page.getByRole("button", { name: /Export/i }).first().click();
      await page.waitForTimeout(800);
    },
  },
  {
    id: "5.2",
    part: 1,
    description: "Sidan Verifiera med uppladdning av två filer och diff-resultat.",
    url: () => "/verifiera",
  },
  {
    id: "5.3",
    part: 1,
    description: "(Valfritt) Jämförelsevy mellan två versioner med färgkodad diff.",
    url: (ctx) =>
      ctx.areaSlug && ctx.compareVersions
        ? `/maps/${ctx.areaSlug}/compare?v1=${ctx.compareVersions.v1}&v2=${ctx.compareVersions.v2}`
        : null,
    settleMs: 15000,
  },
  {
    id: "6.1",
    part: 2,
    description: "Områdessidan: avsnittet «Ladda upp ny version» med filväljare och kommentarsfält.",
    url: (ctx) => (ctx.areaSlug ? `/maps/${ctx.areaSlug}` : null),
    region: (page) => sectionWithHeading(page, /Ladda upp ny version/),
  },
  {
    id: "6.2",
    part: 2,
    description: "Diff-vy efter uppladdning: grönt = tillagt, rött = borttaget, gult = ändrat.",
    url: (ctx) =>
      ctx.areaSlug && ctx.compareVersions
        ? `/maps/${ctx.areaSlug}/compare?v1=${ctx.compareVersions.v1}&v2=${ctx.compareVersions.v2}`
        : null,
    settleMs: 15000,
  },
  {
    id: "6.3",
    part: 2,
    description: "Versionshistorik med både publicerade och opublicerade rader.",
    url: (ctx) => (ctx.areaSlug ? `/maps/${ctx.areaSlug}#versionshistorik` : null),
    region: (page) => page.locator("#versionshistorik"),
  },
  {
    id: "7.1",
    part: 2,
    description: "Versionsrad med knapp «Publicera» och badge «Publicerad».",
    url: (ctx) => (ctx.areaSlug ? `/maps/${ctx.areaSlug}#versionshistorik` : null),
    region: (page) => page.locator("#versionshistorik"),
  },
  {
    id: "7.2",
    part: 2,
    description: "AreaStatusBanner: «Publicerad version v3», ev. antal väntande kartförslag.",
    url: (ctx) => (ctx.areaSlug ? `/maps/${ctx.areaSlug}` : null),
    region: (page) =>
      page.locator("div").filter({ hasText: /^Kräver uppmärksamhet/ }).last(),
  },
  {
    id: "8.1",
    part: 2,
    description: "Utcheckning: rita polygon på kartan, bekräfta utcheckning.",
    url: (ctx) => (ctx.areaSlug ? `/maps/${ctx.areaSlug}/checkout` : null),
    settleMs: 8000,
  },
  {
    id: "8.2",
    part: 2,
    description: "Översiktskarta med färgade utcheckningsytor och namn.",
    url: (ctx) => (ctx.areaSlug ? `/maps/${ctx.areaSlug}` : null),
    region: (page) => sectionWithHeading(page, /Utcheckningsområden på kartan/),
    settleMs: 6000,
  },
  {
    id: "8.3",
    part: 2,
    description: "Incheckning: diff mellan utcheckad fil och inlämnad fil.",
    url: (ctx) =>
      ctx.areaSlug && ctx.checkoutId ? `/maps/${ctx.areaSlug}/checkout/${ctx.checkoutId}` : null,
    settleMs: 10000,
  },
  {
    id: "8.4",
    part: 2,
    description: "Utcheckningslistan på områdessidan med status «Aktiv».",
    url: (ctx) => (ctx.areaSlug ? `/maps/${ctx.areaSlug}` : null),
    region: (page) => sectionWithHeading(page, /Aktiva utcheckningar/),
  },
  {
    id: "9.1",
    part: 2,
    description: "Områdessidan: kartförslagssektion med antal väntande.",
    url: (ctx) => (ctx.areaSlug ? `/maps/${ctx.areaSlug}` : null),
    region: (page) => sectionWithHeading(page, /Kartförslag/),
  },
  {
    id: "9.2",
    part: 2,
    description: "Detaljvy för ett kartförslag med karta, beskrivning och bifogat foto.",
    url: (ctx) =>
      ctx.areaSlug && ctx.suggestionId
        ? `/maps/${ctx.areaSlug}/suggestions/${ctx.suggestionId}`
        : null,
    settleMs: 6000,
  },
  {
    id: "10.1",
    part: 2,
    description: "Versionsjämförelse: väljare + kartvy med diff.",
    url: (ctx) =>
      ctx.areaSlug && ctx.compareVersions
        ? `/maps/${ctx.areaSlug}/compare?v1=${ctx.compareVersions.v1}&v2=${ctx.compareVersions.v2}`
        : null,
    settleMs: 15000,
  },
  {
    id: "10.2",
    part: 2,
    description: "(Valfritt) PDF-export av versionsdiff.",
    manual:
      "Klicka «Exportera PDF-rapport» i jämförelsevyn och ta bilden på den nedladdade PDF:en.",
  },
  {
    id: "11.1",
    part: 3,
    description: "Admin → Användare: tabell med filter «Väntar på godkännande».",
    url: () => "/admin/users",
  },
  {
    id: "11.2",
    part: 3,
    description: "Dialog för godkännande: välj roll Läsare / Redaktör / Administratör.",
    manual:
      "Kräver ett konto med status «Väntar på godkännande». Öppna godkännandedialogen utan att bekräfta.",
  },
  {
    id: "12.1",
    part: 3,
    description: "Startsidan: «Skapa nytt kartområde» under listan.",
    url: () => "/",
    region: (page) => sectionWithHeading(page, /Skapa nytt kartområde/),
  },
  {
    id: "12.2",
    part: 3,
    description: "Områdessidan: «Arkivera område» och meddelande om arkiverat område.",
    manual: "Arkivera ett testområde och ta bilden innan du återställer det.",
  },
  {
    id: "12.3",
    part: 3,
    description: "(Valfritt) Redigera namn vid sidtitel.",
    manual: "Klicka redigeringsikonen vid områdestiteln och ta bilden med fältet öppet.",
  },
  {
    id: "13.1",
    part: 3,
    description: "Admin → Utcheckningar: lista med statuskolumner.",
    url: () => "/admin/checkouts",
  },
  {
    id: "13.2",
    part: 3,
    description: "Integrera incheckning: bekräftelsedialog och resultat «Version vN skapad».",
    manual:
      "Kräver en incheckning med status «Väntar på integration». Ta bilden på bekräftelsedialogen.",
  },
  {
    id: "13.3",
    part: 3,
    description: "(Valfritt) Avbryt utcheckning — adminåtgärd.",
    manual: "Öppna en aktiv utcheckning och ta bilden på dialogen för «Avbryt utcheckning».",
  },
  {
    id: "14.1",
    part: 3,
    description: "Admin → Lagring: tabell med områden, antal versioner, banor, storlek.",
    url: () => "/admin/lagring",
  },
  {
    id: "14.2",
    part: 3,
    description: "Admin → Inställningar: SMTP-fält och «Skicka testmail».",
    url: () => "/admin/settings",
  },
  {
    id: "14.3",
    part: 3,
    description: "(Valfritt) Admin → Loggning eller Feedback.",
    url: () => "/admin/loggning",
  },
];

export const shotById = new Map(courseShots.map((shot) => [shot.id, shot]));
