export type ReleaseNote = {
  /** ISO-datum (YYYY-MM-DD), nyast först */
  date: string;
  title: string;
  items: string[];
};

export const releaseNotes: ReleaseNote[] = [
  {
    date: "2026-08-05",
    title: "Konto, lösenord och profil",
    items: [
      "Glömt lösenord — tillfälligt lösenord via e-post (giltigt 1 timme) med tvingat byte vid inloggning",
      "Min profil — klicka på ditt namn i menyn för behörighet, notisinställningar och lösenordsbyte",
      "E-post till användare när admin godkänner konto (med tilldelad behörighet)",
      "Användare kan själva styra e-postnotiser och .ocd-bilaga i profilen",
      "Fix: lager som «Tillagda/Ändrade» och symboler som 301.004 syns nu korrekt (felaktig tolkning av OCAD-lagerflaggor)",
    ],
  },
  {
    date: "2026-08-04",
    title: "Lagring, e-post och admin",
    items: [
      "Ny admin-flik Lagring — dashboard med MB per område, uppladdningstrend och detaljtabell",
      "E-post vid incheckning bifogar nu .ocd till admin och prenumeranter med «Bifoga .ocd»",
      "Testmail med bifogad fil under Admin → Inställningar",
      "E-postutskick loggas i Admin → Loggning (mottagare med/utan bilaga)",
      "Förbättrad Gmail-felhantering (app-lösenord krävs)",
    ],
  },
  {
    date: "2026-08-04",
    title: "Område-terminologi och gränssnitt",
    items: [
      "«Kartfiler» heter nu Område i gränssnittet",
      "Versionshistorik och banor: ikonknappar med tooltips i stället för textknappar",
      "Filnamn i versionshistoriken är klickbart för att öppna kartan",
      "Redigera namn och radera område som ikoner bredvid karttiteln",
      "Sidhuvud visar användarnamn (roll i tooltip)",
    ],
  },
  {
    date: "2026-08-04",
    title: "Notiser och användarhantering",
    items: [
      "Notisprenumeration flyttad till Admin → Användare (per användare)",
      "Valfri .ocd-bilaga i notiser per prenumerant",
      "Admin kan redigera användare (namn, e-post, roll) utan att se lösenord",
      "Senaste inloggning visas i användarlistan",
    ],
  },
  {
    date: "2026-08-03",
    title: "Loggning och tid",
    items: [
      "Admin → Loggning — filter, sortering och läsbara händelsetexter",
      "Tidsstämplar i Europe/Stockholm (svensk tid)",
    ],
  },
  {
    date: "2026-08-02",
    title: "Utcheckning, banor och produktion",
    items: [
      "Utcheckning (checkout) — checka ut område, redigera i OCAD, checka in och integrera",
      "Diff och integrationsvarningar vid utcheckning",
      "Lägg bana — IOF-symboler 700–709, skuggbana, PDF-export",
      "E-postnotiser via SMTP (registrering, versioner, checkout-flöde)",
      "Produktion på Vercel med PostgreSQL och Blob-lagring",
      "Direktuppladdning av stora .ocd-filer via Blob",
    ],
  },
  {
    date: "2026-08-01",
    title: "Grundfunktioner",
    items: [
      "Inloggning, registrering och rollstyrning (läsare, redaktör, admin)",
      "Områden med versionshistorik och publicering",
      "Jämförelse (diff) mellan versioner",
      "Verifiera — tillfällig jämförelse utan uppladdning",
      "Kartvy, GPS, export till PDF/OCAD",
      "Termer: «utcheckning» och «aktuell version» i användargränssnittet",
    ],
  },
];

export function formatReleaseNoteDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("sv-SE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
