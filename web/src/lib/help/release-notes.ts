export type ReleaseNote = {
  /** ISO-datum (YYYY-MM-DD), nyast först */
  date: string;
  title: string;
  items: string[];
};

export const releaseNotes: ReleaseNote[] = [
  {
    date: "2026-08-16",
    title: "Importera delkarta: tydligare kartvy i Kanter",
    items: [
      "I steget «Kanter» (och «Ändringar») kan du växla mellan hela kartan och bara berörda objekt",
      "Du kan visa objekt som raderas i originalkartan tillsammans med nya och ändrade/ersatta objekt från delkartan",
    ],
  },
  {
    date: "2026-08-16",
    title: "Importera delkarta: bekräfta fungerar på stora kartor",
    items: [
      "Steget «Bekräfta» i Importera delkarta slutförs nu även för stora områden (t.ex. Mora Väst) i stället för att stanna med ett tekniskt fel",
      "Det kan fortfarande ta en stund — vänta tills utcheckningen öppnas",
    ],
  },
  {
    date: "2026-08-16",
    title: "Mora Väst går att öppna efter uppladdning",
    items: [
      "Uppladdade stora kartor (t.ex. Mora_Väst_med_VenjanKos12.ocd) fastnade tidigare på «Parsar…» utan kartbild — det är åtgärdat",
      "Kartbilden skapas mer tillförlitligt för stora filer, så området går att öppna och titta på",
    ],
  },
  {
    date: "2026-08-16",
    title: "Stora kartor som Mora Väst går att öppna",
    items: [
      "Kartbilden för stora filer (ca 30 MB SVG) hämtas direkt från lagringen med tillfällig länk — den stoppas inte längre av serverns storleksgräns",
      "Öppna området eller «Visa karta» och vänta tills kartan ritas (kan ta en stund första gången)",
    ],
  },
  {
    date: "2026-08-14",
    title: "Stora kartor går att öppna",
    items: [
      "Stora filer som Mora Väst kan öppnas och tittas på — kartbilden skickas i ström så den inte stoppas av serverns storleksgräns",
      "Nedladdning av stora .ocd-filer fungerar på samma sätt",
    ],
  },
  {
    date: "2026-08-14",
    title: "Importera delkarta",
    items: [
      "Ny guide «Importera delkarta» när du har en .ocd som inte checkades ut här — först symbolmatchning, sedan läge, kanter och ändringar på kartan",
      "Guiden skapar en utcheckning i efterhand från filens utbredning; objekt som går över kanten raderas inte automatiskt",
      "Kartan i steget «Läge» visas som samma kartbild som på området, inzoomad på delkartan med blå ram — stora filer (t.ex. Mora Väst) ritas som karta, inte som en enda bild",
      "Kartbilden hämtas från den redan laddade områdeskartan. Om den saknas: öppna området först och försök igen",
    ],
  },
  {
    date: "2026-08-13",
    title: "GPS-noggrannhet syns tydligare",
    items: [
      "När positionsnoggrannheten är Osäker (över ca 20 m) blir GPS-markeringen och statusraden röda",
    ],
  },
  {
    date: "2026-08-13",
    title: "OCD-export av kartförslag",
    items: [
      "«Exportera endast kartförslag» skapar åter en giltig OCAD-fil — tidigare kunde filen bli korrupt och OCAD visa internt fel vid öppning",
    ],
  },
  {
    date: "2026-08-12",
    title: "Säkerhetsförbättringar",
    items: [
      "Striktare behörighetskontroll: roller och «måste byta lösenord» hämtas från databasen, inte från webbläsaren",
      "Säkrare filuppladdning till molnlagring — sökvägar binds till rätt karta/version",
      "Begränsning av antal försök vid inloggning, registrering och «glömt lösenord»",
      "Säkerhetsrubriker i webbläsaren (bl.a. mot clickjacking och MIME-sniffning)",
      "Kart-SVG saneras innan den visas, och preview-svar får striktare säkerhetsrubriker",
    ],
  },
  {
    date: "2026-08-12",
    title: "Kartförslag — ihopfälld symbolhjälp",
    items: [
      "«Infoga symbol för markering» är ihopfälld som standard — öppna sektionen när du vill välja symbol (gäller även på mobil)",
    ],
  },
  {
    date: "2026-08-12",
    title: "Närmare inzoom på kartan",
    items: [
      "Du kan zooma in till skala 1:50 (tidigare max 1:100)",
    ],
  },
  {
    date: "2026-08-12",
    title: "Snabbare inskickning av kartförslag",
    items: [
      "Inskickningsdialogen svarar snabbare när du skriver beskrivning och rubrik — kartan bakom omritas inte längre vid varje tangenttryckning",
    ],
  },
  {
    date: "2026-08-12",
    title: "Min position följer dig",
    items: [
      "Efter «Min position» zoomas kartan till närmaste tillåtna skala och panoreras till din plats var 10:e sekund tills du stoppar GPS",
    ],
  },
  {
    date: "2026-08-11",
    title: "Kartförslag — tala in beskrivning",
    items: [
      "Knappen «Tala» vid beskrivningen låter dig säga ett symbolnamn (t.ex. «Sten») — texten matchas mot kartans symboler och infogas på aktiv markering",
      "«Rensa» bredvid mikrofonen tömmer beskrivningsrutan",
      "Fungerar i webbläsare som stödjer taligenkänning (t.ex. Chrome/Edge); knappen döljs annars",
    ],
  },
  {
    date: "2026-08-11",
    title: "Kartförslag — Navigera som startläge",
    items: [
      "Kartan öppnas i «Navigera» så du kan panorera och zooma utan att råka rita",
      "När du väljer ett ritverktyg aktiveras «Rita» automatiskt",
      "«Tillbaka» finns både överst och nederst i inskickningsdialogen",
    ],
  },
  {
    date: "2026-08-11",
    title: "Kartförslag — symbolnamn i beskrivningen",
    items: [
      "Infoga symbol visar beskrivningar från OCAD-filen (t.ex. «Sten»), grupperade under kartlager",
      "Listan filtreras efter aktiv markering — punkt, linje eller yta (vid «Punkt (radera)» visas alla symboltyper)",
      "Symboler sorteras efter hur ofta de används på kartan — vanligast överst",
      "Symbolval i en vertikal lista som är lättare att använda på mobil",
      "När du väljer markering och symbol behålls raden (t.ex. «1. Punkt — Sten») — symbolen läggs alltid till i slutet av raden",
      "Snabbval, sök överst i listan och «Visa alla» när kartan har många symboler",
    ],
  },
  {
    date: "2026-08-11",
    title: "Kartförslag — enklare beskrivning på mobil",
    items: [
      "Inskickningsdialogen förfyller en rad per markering (punkt, linje eller yta)",
      "Hoppa till rätt markering via nummerknappar när du har flera ändringar",
    ],
  },
  {
    date: "2026-08-11",
    title: "Admin — loggning",
    items: [
      "Loggsidan visar de senaste 50 händelserna först",
      "Finns fler loggar kan du klicka «Visa alla» för att fälla ut hela listan",
    ],
  },
  {
    date: "2026-08-11",
    title: "Läsare — tydligare behörigheter",
    items: [
      "Läsare ser inte utcheckningsområden, aktiva utcheckningar eller utcheckningshistorik",
      "Områdeslistan visar bara områden med minst en publicerad kartversion",
      "Knappen «Föreslå ändring» finns direkt på områdessidan när kartan är publicerad",
      "Läsare kan inte välja .ocd-bilaga i e-postnotiser (gäller även befintliga prenumerationer)",
    ],
  },
  {
    date: "2026-08-11",
    title: "Lägg bana — publicerad kartversion",
    items: [
      "Banläggning använder alltid den publicerade kartversionen — även för redaktörer när en nyare opublicerad version finns",
      "Läsare kan lägga banor så länge det finns en publicerad version; utan publicerad version visas ett tydligt meddelande",
      "PDF-export av banor baseras också på den publicerade versionen",
    ],
  },
  {
    date: "2026-08-11",
    title: "Utcheckning — val av OCAD-format",
    items: [
      "Vid utcheckning väljer du OCAD-format (10, 11, 12 eller 2018) innan filen skapas — t.ex. OCAD 12 om du inte har OCAD 2018",
      "Valt format visas på utcheckningssidan och i filnamnet vid nedladdning",
    ],
  },
  {
    date: "2026-08-10",
    title: "Kartförslag — platsnoggrannhet",
    items: [
      "Vid inskickning anger du hur säker du är på platsen: Mycket säker, Ganska säker, Osäker eller Behöver fältverifiering",
      "Platsnoggrannhet visas i listan, på detaljsidan och i PDF-export av öppna förslag",
      "Standard är «Ganska säker»; befintliga förslag har samma standard",
    ],
  },
  {
    date: "2026-08-10",
    title: "Kartförslag — Navigera-ikon",
    items: [
      "Tydligare hand-ikon för «Navigera» (större, fylld siluett med fem fingrar)",
    ],
  },
  {
    date: "2026-08-10",
    title: "Hjälp-PDF",
    items: [
      "PDF-export från guiden inkluderar flödesscheman (Mermaid) som bilder",
      "Fix: texter med « », pilar och andra specialtecken renderas korrekt i PDF (inte bokstav-för-bokstav)",
      "Exportknappen väntar tills processdiagram är färdigladdade",
    ],
  },
  {
    date: "2026-08-10",
    title: "Förbättrad diff-matchning",
    items: [
      "Alla diff-typer (version, verifiera, utcheckning) matchar objekt hybrid: först OCAD objectIndex, sedan position och geometri",
      "Linjer jämförs med Hausdorff-avstånd — små vertex-justeringar inom tolerans (2 m) räknas inte som ändring",
      "Upptäcker korsvis bytta objekt (samma positioner men ombytt innehåll) som tidigare kunde missas",
    ],
  },
  {
    date: "2026-08-10",
    title: "Diff-changelista",
    items: [
      "Versionsjämförelse sparar fler ändringar i listan (standard upp till 50 000; env DIFF_MAX_STORED_CHANGES) — kartlagren byggs alltid på alla ändringar",
      "Changelistan i diff-vyn pagineras (200 per sida) med tydlig varning om listan kapats vid lagring",
    ],
  },
  {
    date: "2026-08-10",
    title: "Admin e-postinställningar",
    items: [
      "Under Admin → Inställningar: ange dagar till första utcheckningspåminnelse och intervall för upprepade påminnelser tills ärendet är hanterat",
      "Flera admin-notisadresser kan anges (komma, semikolon eller radbrytning) — testmail skickas till alla",
    ],
  },
  {
    date: "2026-08-10",
    title: "Kartförslag och hjälp-PDF",
    items: [
      "Kartförslag på kartan visar nummer (1, 2, 3 …) vid varje markering — inte kategorinamn",
      "Punktmarkeringar är mindre och visas som en enkel prick utan kontur",
      "Ritverktyg (punkt, rektangel, polygon, linje, radera) som ikoner med tooltip till höger på kartan vid «Föreslå kartändring»",
      "GPS-spår som ikon i ritverktygsraden (mellan linje och radera); Rita och Navigera under ritverktygen till höger",
      "Valt ritverktyg markeras med röd ram — ikonen behålls synlig",
      "Åtgärdsknappar (lägg till, rensa, skicka in) anpassade för mobil — full bredd längst ned på kartan; ritverktygen till höger flyttas upp på mobil",
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
