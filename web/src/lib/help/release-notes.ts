export type ReleaseNote = {
  /** ISO-datum (YYYY-MM-DD), nyast först */
  date: string;
  title: string;
  items: string[];
};

export const releaseNotes: ReleaseNote[] = [
  {
    date: "2026-08-05",
    title: "Kartförslag — tydligare skapa-vy",
    items: [
      "Formulär (kategori, beskrivning, foto) ligger ovanför kartan när du skapar kartförslag",
      "Knappen «Lägg till ändring» aktiveras först efter «Slutför» — då kan du lägga till fler markeringar",
      "Skicka-knappen visar antal ändringar (t.ex. «Skicka kartförslag (2 st)») i en egen sektion",
    ],
  },
  {
    date: "2026-08-05",
    title: "Kartförslag — kartvy och lager",
    items: [
      "Etiketter på kartförslag (kategori/rubrik) syns tydligt på kartan utan att ta över",
      "Klicka på ett kartförslag i listan på områdessidan för att zooma kartan till markeringen",
      "Detaljsidan zoomar automatiskt till markeringen när du öppnar förslaget",
      "Lagerpanelen under kartan är ihopfälld som standard — klicka «Lager» för att expandera",
    ],
  },
  {
    date: "2026-08-05",
    title: "Kartvy — högre maxzoom",
    items: [
      "Alla kartor kan nu zoomas in till 4000 % (tidigare 3000 %)",
    ],
  },
  {
    date: "2026-08-05",
    title: "Kartförslag — tydligare markeringar på kartan",
    items: [
      "Linjer och punkter i kartvyn (översikt, skapa och detalj) ritas tjockare så de syns bättre mot kartan",
      "Kartutklipp i PDF-rapporten visar minst 200×200 meter i terräng runt varje förslag, även punktmarkeringar",
      "Markeringar i PDF-kartbilden ritas 5× tjockare än standard så de syns tydligt i utskriften",
    ],
  },
  {
    date: "2026-08-05",
    title: "Export — kartförslagsrapport och GeoTIFF",
    items: [
      "Exportera alla öppna och pågående kartförslag som PDF från listan på områdessidan (text, foto och kartutklipp per förslag)",
      "Exportera kartutsnitt som georefererad GeoTIFF (.tif) i samma exportmeny som PDF och OCD (kräver EPSG i kartfilen)",
    ],
  },
  {
    date: "2026-08-05",
    title: "Kartförslag — zoom till markering",
    items: [
      "Knappen «Zooma till markering» på detaljsidan zoomar kartan till förslagets markering(ar)",
    ],
  },
  {
    date: "2026-08-05",
    title: "Kartförslag — förbättrad skapande",
    items: [
      "Snabbare textinmatning när du skriver beskrivning vid kartförslag",
      "Lägg till flera markeringar (punkter, ytor, linjer) i samma förslag innan du skickar",
      "Beskrivningen räcker med minst 2 tecken",
      "Alla markeringar i ett förslag syns på kartan",
    ],
  },
  {
    date: "2026-08-05",
    title: "Kartförslag — fas 3",
    items: [
      "Rita polygon eller linje utöver punkt och rektangel när du lämnar kartförslag",
      "Öppna och pågående förslag syns som orange markering på kartvy och områdessidan — klicka för att öppna",
      "Växla «Visa kartförslag» i kartvyn för att dölja eller visa lagret",
      "Stora foton (över ca 4,5 MB) kan laddas upp utan storleksfel",
      "Du kan redigera egna öppna förslag — text, kategori och markering på kartan",
    ],
  },
  {
    date: "2026-08-05",
    title: "Kartförslag — fas 2",
    items: [
      "Markera rektangel/yta utöver punkt när du lämnar kartförslag",
      "Ny status «Pågår» mellan öppen och införd/avvisad",
      "Valfritt foto kan bifogas vid skapande — visas som miniatyr på detaljsidan",
      "Skaparen får e-post när förslaget granskas (om notiser är påslagna i profilen)",
      "Redaktörer kan koppla checkout och införd version vid granskning",
      "Äldre förslag visar «Gäller version N» när en nyare version publicerats",
    ],
  },
  {
    date: "2026-08-05",
    title: "Kartförslag",
    items: [
      "Nytt skissverktyg — lämna kartförslag med markering och kommentar på publicerade versioner",
      "Lista och granska förslag på områdessidan; redaktörer kan markera som införda eller avvisade",
      "E-postnotis till prenumeranter när nytt kartförslag skapas",
    ],
  },
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
