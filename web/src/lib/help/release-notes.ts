export type ReleaseNote = {
  /** ISO-datum (YYYY-MM-DD), nyast först */
  date: string;
  title: string;
  items: string[];
};

export const releaseNotes: ReleaseNote[] = [
  {
    date: "2026-08-10",
    title: "Kartförslag och hjälp-PDF",
    items: [
      "Kartförslag på kartan visar nummer (1, 2, 3 …) vid varje markering — inte kategorinamn",
      "Punktmarkeringar är mindre och visas som en enkel prick utan kontur",
      "Ritverktyg (punkt, rektangel, polygon, linje, radera) som ikoner med tooltip till höger på kartan vid «Föreslå kartändring»",
      "Fix: verktygsknappar på kartan fångar klick utan att samtidigt rita i kartan",
      "Fix: öppna och pågående kartförslag från äldre (opublicerade) versioner går att öppna från listan och kartan — tidigare gav de felmeddelandet «hittades inte»",
      "Fix: «Exportera PDF» på hjälpsidan fungerar igen — exporten väntar på att guiden laddats och fastnar inte längre på processdiagram",
    ],
  },
  {
    date: "2026-08-09",
    title: "Områdessidan, kartförslag och feedback",
    items: [
      "Feedback: rapportera buggar och föreslå förbättringar (tumme upp, en röst per person); admin kvitterar under Admin → Feedback",
      "Hjälpen är uppdelad i översikt, guide, buggar, förbättringsförslag och release notes",
      "Gul statusbanner på områdessidan när något kräver uppmärksamhet — kartförslag (uppdelat per version), opublicerad senaste version (redaktörer) eller utcheckade områden",
      "Kartförslag på kartan och i listan: alla öppna och pågående från alla versioner, även äldre (t.ex. v5 när v7 är publicerad); införda och avvisade döljs",
      "Under Kartförslag anges vilken version som är publicerad",
      "Välj två valfria versioner att jämföra ovanför versionshistoriken",
      "Versionshistorik: rätt tooltips på åtgärdsikonerna (ladda ner, jämför, m.m.)",
      "Kartexport (PDF, GeoTIFF, OCD) fungerar igen",
      "Konsekvent svenska i gränssnittet — «utcheckningar» i stället för «checkouts»; «aktuell version» i stället för «head»",
      "Release notes samlade till en post per dag (9 augusti–1 augusti)",
      "Fix: dubbel admin-meny på sidan Användarhantering",
      "Fix: «Visste du att…»-tips länkar till rätt avsnitt i användarguiden",
    ],
  },
  {
    date: "2026-08-08",
    title: "Versionsflöde, utcheckning och hjälp",
    items: [
      "Tydligare väg från lagring till redigering: statusbanner, utcheckningshistorik, admin-flik Utcheckningar, rekommenderad version, PDF-diffexport",
      "Efter utcheckningsintegration: knappar för jämförelse, visa version och publicera; varning om aktuell version ändrats",
      "Blockering av full uppladdning vid aktiva utcheckningar; bekräftelse vid dublett-uppladdning och före admin-integration",
      "Arkivering av områden; påminnelser vid väntande admin-integration",
      "GPS-spårning: zoom 1:100 och positionsföljning var 10:e sekund; snabbare knappar under spårning",
      "«?»-ikon i formulär och dialoger länkar till relevant hjälpavsnitt",
      "Hjälpikon i versionshistorikens kolumnrubriker; justerade kolumnbredder",
      "Admin: användarformulär i full bredd; exportetikett «Exportera endast kartförslag»",
    ],
  },
  {
    date: "2026-08-07",
    title: "Kartvy, versionshistorik och kartförslag",
    items: [
      "Kartvy: skala i stället för procent (t.ex. 1:15 000); kraftigare max-inzoom (1:100)",
      "Versionshistorik: klickbar rad öppnar kartan; datum i stället för filnamn; tydligare kolumner",
      "Endast en publicerad version per område — ny publicering avpublicerar föregående",
      "Hjälp: process-scheman per avsnitt; «Visste du att…»-tips på startsidan",
      "Kartförslag: enklare skapa-flöde, magenta markeringar, GPS-spår, ta foto i dialogen, flera markeringar per förslag",
      "GPS-spår filtrerar hopp och förenklar linjen automatiskt",
    ],
  },
  {
    date: "2026-08-06",
    title: "Utcheckning, export och kartförslag",
    items: [
      "Stabilare admin-integration av utcheckning med validering och tydligare felmeddelanden",
      "OCD-export av kartförslag som riktiga OCAD-objekt; buffertfix vid export",
      "Kartförslag: vem som satte status (Pågår, Införd, Avvisad) visas med datum",
    ],
  },
  {
    date: "2026-08-05",
    title: "Kartförslag — full funktion",
    items: [
      "Nytt skissverktyg: markera terrängändringar på publicerade versioner (punkt, yta, linje, rektangel)",
      "Lista, granska och exportera PDF; status Öppen, Pågår, Införd, Avvisad; «Gäller version N» vid äldre förslag",
      "Markeringar på kartan, zoom från listan, foto, redigera egna öppna förslag",
      "Export: kartförslag i PDF, GeoTIFF och OCD (symbolval per geometrityp)",
      "Konto: glömt lösenord, Min profil (behörighet, notiser, lösenordsbyte), godkännande-mail",
      "Lägg bana: alla IOF-symboler 701–709, kontrollista med start/mål, förbättrad radering",
      "Sidhuvud visar ditt namn; kartvy maxzoom 4000 %",
      "Fix: OCAD-lager och symboler (t.ex. 301.004) visas korrekt",
    ],
  },
  {
    date: "2026-08-04",
    title: "Admin, lagring och terminologi",
    items: [
      "Admin → Lagring: dashboard med MB per område och uppladdningstrend",
      "E-post vid incheckning kan bifoga .ocd; testmail och loggning av utskick",
      "«Kartfiler» heter Område; ikonknappar i versionshistorik och banor",
      "Notisprenumeration under Admin → Användare; redigera användare; senaste inloggning",
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
      "Utcheckning — checka ut område, redigera i OCAD, checka in och integrera",
      "Diff och integrationsvarningar vid utcheckning",
      "Lägg bana — IOF-symboler 700–709, skuggbana, PDF-export",
      "E-postnotiser via SMTP (registrering, versioner, utcheckningsflöde)",
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
