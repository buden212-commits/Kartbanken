export type ReleaseNote = {
  /** ISO-datum (YYYY-MM-DD), nyast först */
  date: string;
  title: string;
  items: string[];
};

export const releaseNotes: ReleaseNote[] = [
  {
    date: "2026-09-02",
    title: "Självstudier — snyggare listor",
    items: [
      "Checklistor och punktlistor i kursmaterialet bryts inte längre konstigt på två rader",
    ],
  },
  {
    date: "2026-09-02",
    title: "Självstudier i Hjälp — fix",
    items: [
      "Hjälp → Självstudier kraschade vid visning av kursmaterialet — sidan laddas nu korrekt",
    ],
  },
  {
    date: "2026-09-02",
    title: "Självstudier i Hjälp",
    items: [
      "Kursmaterialet med övningar och skärmdumpar finns nu under Hjälp → Självstudier, direkt efter guiden",
      "Samma innehåll kan laddas ner som PDF från sidan",
    ],
  },
  {
    date: "2026-09-01",
    title: "Jämför versioner — mycket snabbare och blir klar",
    items: [
      "Jämförelsen ritade tidigare upp hela kartan i onödan bara för att räkna ut bildens mått — det steget är borta och var huvudorsaken till att jämförelsen aldrig blev klar",
      "Kartfilerna läses nu en gång i stället för flera gånger per jämförelse",
      "Resultatet sparas så snart skillnaderna är uträknade, innan kartlagren ritas — en avbruten körning tappar inte längre hela jobbet",
      "Vänteläget visar vilken av etapperna «Läser kartfiler», «Beräknar skillnader» och «Skapar kartlager» som pågår",
      "Statussidan svarar direkt medan beräkningen körs, så förfluten tid och etapp uppdateras hela tiden",
      "Om kartlagren inte hinner bli klara visas skillnaderna ändå, och lagren skapas vid nästa besök",
    ],
  },
  {
    date: "2026-08-31",
    title: "Uppladdare vid integrerad utcheckning",
    items: [
      "När en utcheckning integreras visas den som checkade in som «Uppladdare» i versionshistoriken — inte administratören som granskar",
      "Gäller även när någon annan (t.ex. admin) checkar in åt utcheckningsägaren",
    ],
  },
  {
    date: "2026-08-31",
    title: "Jämför versioner — tydligare vänteläge",
    items: [
      "Medan jämförelsen körs visas spinner, vilket steg som pågår och förfluten tid",
      "När kartlager byggs visas räknare (X av Y rutor) och progressfält",
      "Samma förbättrade vänteläge gäller även Verifiera-jämförelsen",
    ],
  },
  {
    date: "2026-08-31",
    title: "Klipp — fler luckor, markörer och auto-förslag",
    items: [
      "Luckor kan läggas på starttriangeln (701) och på sträckans slut vid kontroll/mål (inkommande sträcka)",
      "Gröna markörer visar luckor i Klipp-läge — dra markören för att flytta luckan",
      "Nya luckor snäpps automatiskt mot närmaste kartsymbol (sten, höjd etc.) när kartindex laddats",
    ],
  },
  {
    date: "2026-08-31",
    title: "Banläggning — klipp bort del av kontroll eller sträcka",
    items: [
      "Nytt verktyg «Klipp» i banredigeraren — klicka på kontrollcirkel, bansträcka eller manuell linje för att skapa en lucka så kartsymboler under syns",
      "Klicka igen på samma ställe för att ta bort luckan",
      "Luckor sparas med banan och följer med vid PDF-export",
    ],
  },
  {
    date: "2026-08-31",
    title: "Lägg bana — knapp i sidhuvudet",
    items: [
      "Knappen «Lägg bana» ligger nu uppe bredvid «Checka ut område» och «Föreslå ändring»",
      "När minst en bana finns visas «Banor (antal)» i stället — klick öppnar banredigeraren",
    ],
  },
  {
    date: "2026-08-30",
    title: "Snabbare karta vid utcheckning och kartförslag",
    items: [
      "Utcheckning och kartförslag använder karttiles i stället för en enda stor SVG — zoom och panering ska kännas smidigare även på stora kartor (t.ex. Väst med Venjan)",
      "Första gången en version öppnas kan systemet bygga tiles i bakgrunden («Bygger karttiles…»); därefter laddas bara synliga rutor",
      "Medan tiles byggs visas hur många rutor skapats och hur många återstår",
      "Zoom ner till skala 1:100 stöds via detaljtiles som skapas vid behov",
      "Fix: kartbilden på utcheckningssidan laddas igen för stora .ocd-filer — tidigare kraschade förhandsvisningen på servern",
      "Fix: «Kunde inte hämta tile-status» vid utcheckning — tile-status laddar inte längre bildbiblioteket som kraschade i molnet",
      "Fix: tile-bygget körs nu direkt i anropet i etapper i stället för som bakgrundsjobb — tidigare kunde bygget dö tyst efter några rutor",
      "Fix: «Försök igen» startar om tile-bygget även när kartan visat felmeddelande",
      "Fix: kartor vars sparade kartbild hade ett formatfel gick inte att bygga tiles för («Input buffer has corrupt header») — formatet repareras nu automatiskt vid bygget",
      "Fix: vita rutor i kartan vid hög zoom — en grövre kartbild visas medan detaljrutor hämtas, och rutor som inte kom fram hämtas om automatiskt i stället för att lämnas tomma",
      "Den grövre kartbilden släcks så snart de skarpa rutorna täcker vyn, så kartan bara är suddig medan detaljerna laddas",
      "Banläggning («Lägg bana») och kartan över felobjekt vid incheckning använder nu också karttiles — snabbare zoom och panorering",
      "Fix: GPS-knappen och «zooma till plats» fungerar igen på kartor som använder karttiles",
      "Helskärmsvyn («Öppna i nytt fönster») använder också karttiles — export finns kvar och laddar kartan först vid behov, medan lagerpanelen finns i standardvyn",
    ],
  },
  {
    date: "2026-08-29",
    title: "Kartförslag — verktyg och inskickning",
    items: [
      "Kartan öppnas i «Navigera»; när du väljer ritverktyg aktiveras «Rita» automatiskt",
      "Ritverktyg som ikoner till höger (punkt, rektangel, polygon, linje, radera, GPS-spår); valt verktyg markeras med röd ram",
      "Åtgärdsknappar (lägg till, rensa, skicka in) uppe till höger på större skärm och full bredd längst ned på mobil",
      "Fix: verktygsknappar fångar klick utan att samtidigt rita i kartan",
      "Markeringar numreras (1, 2, 3 …) på kartan; punktmarkeringar som enkel magenta prick",
      "Inskickningsdialogen förfyller en rad per markering — hoppa mellan rader via nummerknappar",
      "Infoga symbol visar OCAD-beskrivningar (t.ex. «Sten»), grupperade under kartlager, filtrerade efter punkt/linje/yta och sorterade efter användning på kartan",
      "Sökfält överst i symbolistan; «Visa alla» vid många symboler",
      "Vid inskickning anger du platsnoggrannhet (Mycket säker till Behöver fältverifiering)",
      "Knappen «Tala» låter dig säga ett symbolnamn som matchas mot kartans symboler; «Rensa» tömmer beskrivningen",
      "«Tillbaka» finns både överst och nederst i inskickningsdialogen",
      "Fix: öppna och pågående kartförslag från äldre versioner går att öppna från listan och kartan",
    ],
  },
  {
    date: "2026-08-29",
    title: "Diff, utcheckning och banor",
    items: [
      "Förbättrad diff-matchning — linjer jämförs med tolerans (2 m) och korsvis bytta objekt upptäcks",
      "Changelistan i diff-vyn pagineras (200 per sida) och visar varning om listan kapats",
      "Vid utcheckning väljer du OCAD-format (10, 11, 12 eller 2018) innan filen skapas",
      "Banläggning och PDF-export av banor använder alltid den publicerade kartversionen",
    ],
  },
  {
    date: "2026-08-29",
    title: "Behörigheter, admin och hjälp",
    items: [
      "Läsare ser inte utcheckningsområden, aktiva utcheckningar eller utcheckningshistorik",
      "Områdeslistan visar bara områden med minst en publicerad kartversion",
      "Knappen «Föreslå ändring» finns direkt på områdessidan när kartan är publicerad",
      "Läsare kan inte välja .ocd-bilaga i e-postnotiser",
      "Admin → Loggning visar de senaste 50 händelserna först — «Visa alla» fäller ut resten",
      "Admin → Inställningar: konfigurera utcheckningspåminnelser och flera admin-notisadresser",
      "PDF-export från guiden inkluderar flödesscheman som bilder med korrekt svensk text",
      "Fix: «Exportera PDF» på hjälpsidan fungerar igen",
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
