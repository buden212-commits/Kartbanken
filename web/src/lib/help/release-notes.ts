export type ReleaseNote = {
  /** ISO-datum (YYYY-MM-DD), nyast först */
  date: string;
  title: string;
  items: string[];
};

export const releaseNotes: ReleaseNote[] = [
  {
    date: "2026-08-09",
    title: "Jämför valfria versioner",
    items: [
      "Ovanför versionshistoriken kan du välja två valfria versioner (A och B) och jämföra dem — samma diff-vy som tidigare",
      "Systemet sorterar automatiskt så äldre version blir utgångspunkt och nyare blir mål",
    ],
  },
  {
    date: "2026-08-09",
    title: "Områdessidan — gul statusbanner",
    items: [
      "Gul banner högst upp när något kräver uppmärksamhet: kartförslag som väntar, opublicerad senaste version (redaktörer) eller utcheckade områden",
      "Bannern döljs när senaste versionen är publicerad och inga öppna eller pågående kartförslag finns (saknas utcheckningar)",
    ],
  },
  {
    date: "2026-08-09",
    title: "Kartexport — exportknapp fungerar igen",
    items: [
      "Export från kartvyn (PDF, GeoTIFF, OCD) fungerar igen efter merge-fix",
    ],
  },
  {
    date: "2026-08-09",
    title: "Feedback — buggar och förbättringsförslag",
    items: [
      "Hjälpen är uppdelad: översikt (/hjalp), guide (/hjalp/guide), buggar, förbättringsförslag och release notes",
      "Alla godkända användare kan rapportera buggar och föreslå förbättringar",
      "Tumme upp på förbättringsförslag — en röst per person",
      "Admin kvitterar under Admin → Feedback (fixad, byggd, avvisad m.m.)",
    ],
  },
  {
    date: "2026-08-09",
    title: "Kartförslag — publicerad version",
    items: [
      "Under Kartförslag anges vilken version som är publicerad (t.ex. «Publicerad version: v13»)",
    ],
  },
  {
    date: "2026-08-09",
    title: "Publicering — info i kartförslagslistan",
    items: [
      "Versionsstatus och publiceringsknappar visas nu under Kartförslag (för redaktörer) i stället för en separat banner högst upp",
      "Äldre opublicerade utkast (t.ex. v11, v12 när v13 redan är publicerad) förklaras tydligt — utan knapp för att publicera dem",
      "Nyare opublicerad version än läsarna ser: jämför och publicera direkt från kartförslagssektionen",
    ],
  },
  {
    date: "2026-08-09",
    title: "Banner — bara när nyare version väntar publicering",
    items: [
      "Gul banner visas bara om det finns en opublicerad version nyare än den läsare redan ser — inte för äldre utkast (t.ex. v11, v12 när v13 redan är publicerad)",
      "Tydligare formulering: «Läsare ser v13 — publicera v14 när den ska ersätta den»",
    ],
  },
  {
    date: "2026-08-09",
    title: "Versionshistorik — tooltips i åtgärdskolumnen",
    items: [
      "Ikonerna under Åtgärder visar nu rätt tooltip (ladda ner, jämför, öppna i nytt fönster, radera) i stället för «Öppna karta»",
    ],
  },
  {
    date: "2026-08-09",
    title: "Opublicerade versioner — tydligare banner",
    items: [
      "Bannern listar nu vilka versionsnummer (t.ex. v4, v5) som väntar granskning",
      "Knappar för att jämföra senaste versionen och publicera den direkt från bannern",
    ],
  },
  {
    date: "2026-08-08",
    title: "Versionsflöde — tydligare väg från lagring till redigering",
    items: [
      "Banner på områdessidan när opublicerade versioner väntar granskning och publicering",
      "Efter checkout-integration: tydliga knappar för jämförelse, visa version och publicera",
      "Checkout-sidan visar basversion, head och publicerad version; varning om head ändrats",
      "Full uppladdning blockeras vid aktiva checkouts (admin kan bekräfta undantag)",
      "Dublett-uppladdning (identiskt innehåll) kräver bekräftelse",
      "Utcheckningsfil: informationsruta om att filen genereras av systemet",
      "Admin måste bekräfta granskning innan integration",
      "Checkout-historik på områdessidan; admin-flik «Checkouts» för väntande integrationer",
      "Markera rekommenderad version i versionshistoriken",
      "Publicering blockeras vid parsningsfel",
      "Jämförelsevy: exportera PDF-rapport",
      "Kartförslag: länk till checkout för redaktörer",
      "Administratörer kan arkivera områden (döljs från startsidan)",
      "Påminnelser skickas även när checkout väntar på admin-integration",
    ],
  },
  {
    date: "2026-08-08",
    title: "Admin och export",
    items: [
      "Redigeringsformuläret för användare öppnas nu över hela tabellbredden i stället för i den smala åtgärdskolumnen",
      "Kryssrutan i exportpanelen heter nu «Exportera endast kartförslag» (tidigare «Inkludera kartförslag»)",
    ],
  },
  {
    date: "2026-08-08",
    title: "GPS-spår — zoom och prestanda",
    items: [
      "Under GPS-spårning zoomas kartan automatiskt till skala 1:100 och följer din position var 10:e sekund",
      "Knappar och verktyg svarar snabbare under spårning — kartan uppdateras inte längre vid varje GPS-punkt",
    ],
  },
  {
    date: "2026-08-08",
    title: "Hjälpikoner — tabellrubriker",
    items: [
      "Hjälpikonen (?) i versionshistoriken sitter i kolumnrubrikraden — vid Version och Pub.",
      "Kolumnbredderna är justerade så tabellen fungerar på både desktop och mobil",
    ],
  },
  {
    date: "2026-08-08",
    title: "Hjälplänkar i formulär och dialoger",
    items: [
      "«?»-ikon uppe till höger i formulär och dialoger länkar till relevant avsnitt i hjälpen",
      "Gäller t.ex. uppladdning, checkout, kartförslag, banor, export, verifiera och admin",
    ],
  },
  {
    date: "2026-08-07",
    title: "Startsidan — tips om funktioner",
    items: [
      "«Visste du att…» på startsidan visar ett kort tips per dag om funktioner i systemet",
      "Tipsen är rollanpassade och länkar till relevant avsnitt i hjälpen",
    ],
  },
  {
    date: "2026-08-07",
    title: "Hjälp — process-scheman",
    items: [
      "Varje huvudavsnitt på hjälpsidan har nu flödesschema (diagram) för tillhörande process",
      "Täcker inloggning, områden, versioner, publicering, checkout, banor, kartförslag, jämförelse, verifiering, kartvy och administration",
    ],
  },
  {
    date: "2026-08-07",
    title: "Publicering — en version per område",
    items: [
      "Endast en kartversion kan vara publicerad åt gången inom samma område",
      "När du publicerar en ny version avpubliceras den tidigare automatiskt",
    ],
  },
  {
    date: "2026-08-07",
    title: "Versionshistorik — klickbar rad",
    items: [
      "Hela raden öppnar kartan — version, datum, storlek, uppladdare, kommentar och status (desktop och mobil)",
      "Pub. och åtgärdsknapparna fungerar som tidigare utan att öppna kartan",
    ],
  },
  {
    date: "2026-08-07",
    title: "Versionshistorik — tydligare kolumnrubriker",
    items: [
      "Mer utrymme mellan kolumnerna Version och Datum i tabellen",
    ],
  },
  {
    date: "2026-08-07",
    title: "Kartvy — kraftigare inzoom",
    items: [
      "Max inzoom i kartvyn motsvarar nu skala 1:100 (tidigare ungefär 1:375 på typisk orienteringskarta)",
    ],
  },
  {
    date: "2026-08-07",
    title: "Versionshistorik — datum öppnar kartan",
    items: [
      "Filnamn visas inte längre i versionshistoriken",
      "Klicka på datumet för att öppna kartversionen (klockslag i tooltip)",
    ],
  },
  {
    date: "2026-08-07",
    title: "Kartvy — skala i stället för zoom i procent",
    items: [
      "Zoomindikatorn i kartvyn visar nominal skala (t.ex. 1:15 000) i stället för procent",
      "«Hela kartan» motsvarar kartfilens skala; zoom in ger t.ex. 1:7 500",
    ],
  },
  {
    date: "2026-08-07",
    title: "Kartförslag — ta foto i inskick-dialogen",
    items: [
      "På mobil kan du klicka «Ta foto» i inskick-dialogen och fotografera direkt — bilden bifogas kartförslaget",
      "«Välj bild» låter dig plocka ett befintligt foto från albumet",
    ],
  },
  {
    date: "2026-08-07",
    title: "Kartförslag — GPS-spårning",
    items: [
      "GPS-spår filtrerar bort orimliga hopp (t.ex. vid dålig mottagning) och utjämnar linjen efter rapporterad noggrannhet",
      "«GPS-spår» ligger nu ovanför kartan (bredvid Rita/Navigera) så knappen syns även på mobil",
      "Ny knapp «GPS-spår» när du föreslår kartändring — gå längs stigen eller spåret och klicka «Sluta spåra»",
      "Spåret filtreras och förenklas automatiskt (Douglas–Peucker) så linjen blir hanterbar i OCAD",
      "Efter avslutad spårning visas medelnoggrannhet och hur många brytpunkter linjen fick",
    ],
  },
  {
    date: "2026-08-07",
    title: "Kartförslag — beskrivning i dialog vid inskick",
    items: [
      "Hela inskick-dialogen döljs tills du klickar «Skicka in kartförslag» i verktygsraden",
      "Ritknapparna (Punkt, Rektangel, …) har åter standardfärger; markeringar på kartan är fortfarande magenta",
    ],
  },
  {
    date: "2026-08-07",
    title: "Kartförslag — enklare skapa-flöde",
    items: [
      "Slutför-steget är borttaget — efter markering på kartan klickar du direkt «Lägg till ändring»",
      "Beskrivningsformuläret är alltid synligt och gäller hela kartförslaget",
      "Markeringar numreras (1, 2, 3 …) på kartan i stället för texten «Förslag»",
      "Kartförslag ritas i magenta (#FD3DB5) i skapa-vy, kartvy, detalj och export",
      "På mobil: växla mellan Rita och Navigera ovanför kartan — nyp för att zooma utan att skapa markeringar av misstag",
    ],
  },
  {
    date: "2026-08-06",
    title: "OCD-export av kartförslag — buffertfix",
    items: [
      "Export av kartförslag till OCD misslyckades tidigare med ett internt buffertfel; det är åtgärdat",
    ],
  },
  {
    date: "2026-08-06",
    title: "Checkout — stabilare admin-integration",
    items: [
      "Admin-integration validerar OCAD-filen innan ny version sparas",
      "Tydligare felmeddelande om integration misslyckas (t.ex. vid ändrade höjdkurvor/linjer)",
      "Diff beräknas om automatiskt om huvudversionen ändrats sedan användaren bekräftade",
    ],
  },
  {
    date: "2026-08-06",
    title: "OCD-export av kartförslag",
    items: [
      "OCD-export med «Exportera endast kartförslag» ger en fil med enbart förslagens markeringar — grundkartan exporteras inte",
      "Symbolval och konvertering läser nu från originalfilen, vilket löser fel när exportversion skiljer sig från källfilen",
      "Tydligare felmeddelande visar vilken markering och symbol som misslyckades",
    ],
  },
  {
    date: "2026-08-06",
    title: "Kartförslag — vem satte status",
    items: [
      "På detaljsidan och i listan visas vem som markerade ett förslag som Pågår, Införd eller Avvisad, med datum",
    ],
  },
  {
    date: "2026-08-05",
    title: "Lägg bana — förbättrad banredigering",
    items: [
      "Alla valbara IOF-symboler (701–709, utom borttagna 700/702/708) går att välja direkt — ingen gråtonad symbol längre",
      "Kontrollista visar start och mål utöver numrerade kontroller",
      "Radera-verktyget tar bort kontroller korrekt och numrerar om efterföljande kontroller",
      "Efter radering av bana stannar du kvar i banredigeraren",
      "Snabbare textinmatning när du skriver banans namn",
    ],
  },
  {
    date: "2026-08-05",
    title: "Navigation — ditt namn i menyn",
    items: [
      "Sidhuvudet visar ditt namn mellan Hjälp och Logga ut (e-post som reserv om namn saknas)",
    ],
  },
  {
    date: "2026-08-05",
    title: "Export — kartförslag i OCD",
    items: [
      "OCD-export kan inkludera öppna och pågående kartförslag som riktiga OCAD-objekt (kryssruta + val av symbol per punkt, linje och yta)",
      "Symbolerna hämtas från kartans befintliga lager — inga nya symboler skapas automatiskt",
      "Stöd för OCAD 12 och OCAD 2018; äldre filformat ger felmeddelande vid kartförslag i export",
    ],
  },
  {
    date: "2026-08-05",
    title: "Export — kartförslag i PDF och GeoTIFF",
    items: [
      "PDF- och GeoTIFF-export kan inkludera öppna och pågående kartförslag för versionen (kryssruta i exportmenyn)",
      "Markeringarna ritas i samma magenta stil som på kartan",
    ],
  },
  {
    date: "2026-08-05",
    title: "Kartförslag — tydligare skapa-vy",
    items: [
      "Formuläret (kategori, beskrivning, foto) är ihopfällt tills du klickat Slutför efter en markering",
      "Slutför och Lägg till ändring visar färg först när respektive steg är aktivt — annars neutral stil",
      "Skicka-sektionen med antal ändringar ligger ovanför kartan, under formuläret",
      "Efter «Lägg till ändring» rensas formuläret och du markerar nästa plats på kartan",
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
      "Öppna och pågående förslag syns som magenta markering på kartvy och områdessidan — klicka för att öppna",
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
