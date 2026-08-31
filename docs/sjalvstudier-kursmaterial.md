# Självstudier — Kartbanken (kartor.ifkmora.se)

Kursmaterial för självstudier med användarfall och steg-för-steg-övningar.
Materialet är uppdelat i **tre delar** efter behörighetsnivå:

| Del | Roll | Tidsåtgång (ungefär) |
|-----|------|----------------------|
| [Del 1 — Läsare](#del-1--läsare) | Läsare | 45–60 min |
| [Del 2 — Redaktör](#del-2--redaktör) | Redaktör | 60–90 min (förutsätter del 1) |
| [Del 3 — Administratör](#del-3--administratör) | Administratör | 45–60 min (förutsätter del 2) |

**Tips:** Klistra in skärmdumpar där det står `[BILD …]`. Bildtexten under varje platshållare beskriver exakt vad som ska synas.

**Mer hjälp i systemet:** [Hjälp — guide](/hjalp/guide) · [Release notes](/hjalp/release-notes)

---

## Roller i korthet

| Roll | Kan bland annat |
|------|-----------------|
| **Läsare** | Se publicerade kartor, kartförslag, egna banor, export, verifiera |
| **Redaktör** | Allt läsare kan + ladda upp/publicera versioner, utcheckning/incheckning |
| **Administratör** | Allt redaktör kan + områden, användare, integrera incheckningar, systeminställningar |

Varje högre roll **inkluderar** allt som lägre roller kan göra.

---

# Del 1 — Läsare

> **Mål:** Du ska kunna hitta publicerade kartor, lämna kartförslag, lägga banor och exportera utsnitt — utan att behöva ladda upp eller publicera kartversioner.

---

## Modul 1.1 — Kom igång

### Teori

1. Gå till inloggningssidan och skapa konto (namn, e-post, lösenord minst 8 tecken).
2. Kontot får status **Väntar på godkännande** tills en administratör godkänner det.
3. Efter godkännande: logga in och öppna profilen via **ditt namn** i sidhuvudet.
4. I profilen ser du din **behörighet** och kan ställa in **e-postnotiser**.

Läsare får e-postnotiser men **inte** .ocd-bilaga i mail.

### Användarfall

**«Jag är ny tränare och vill komma åt klubbens kartor»**

1. Skapa konto.
2. Vänta på godkännande (kontakta kartansvarig om det dröjer).
3. Logga in och kontrollera att rollen är **Läsare**.

### Övning

- [ ] Skapa konto (eller logga in med befintligt).
- [ ] Öppna profilen och notera din roll.
- [ ] Slå på minst en e-postnotis om du vill få mail vid nya versioner.

### Bilder

**[BILD 1.1]** Inloggningssidan med flikarna «Logga in» och «Skapa konto».

**[BILD 1.2]** Profildialogen: behörighet «Läsare», kryssrutor för e-postnotiser, byt lösenord.

---

## Modul 1.2 — Hitta och läsa karta

### Teori

- **Startsidan** visar alla kartområden. Som läsare syns bara områden som har minst en **publicerad** kartversion.
- Klicka på områdesnamnet → **områdessidan** med versionshistorik.
- Klicka på en versionsrad (eller «Öppna karta») → **kartvyn** med zoom, panering och lagerpanel.
- På georefererade kartor finns knappen **Min position** (GPS).

### Användarfall

**«Jag ska kolla senaste publicerade kartan för Venjan inför träning»**

1. På startsidan: hitta området i listan.
2. Öppna områdessidan.
3. I versionshistoriken: hitta raden markerad **Publicerad**.
4. Öppna kartvyn och zooma till relevant del.

### Övning

- [ ] Hitta ett område på startsidan.
- [ ] Identifiera vilken version som är publicerad.
- [ ] Öppna kartan och zooma/panorera.
- [ ] (Valfritt) Testa «Min position» om kartan stödjer GPS.

### Bilder

**[BILD 2.1]** Startsidan med lista över kartområden (namn, senaste version, datum).

**[BILD 2.2]** Områdessidan: versionshistorik med en rad markerad som «Publicerad».

**[BILD 2.3]** Kartvyn i webbläsaren: karta, zoomkontroller, lagerpanel.

---

## Modul 1.3 — Kartförslag

### Teori

Kartförslag låter dig föreslå ändringar på den **publicerade** kartan utan att redigera själva kartfilen.

1. På områdessidan: klicka **Föreslå ändring** (kräver publicerad version).
2. Välj ritverktyg: punkt, linje, polygon, radera.
3. **Navigera** / **Rita** — kartläge växlar automatiskt vid ritning.
4. På mobil: bifoga **foto** eller spela in **GPS-spår** (linje förenklas automatiskt).
5. Fyll i beskrivning och **Skicka in**.
6. Följ status på områdessidan eller under «Kartförslag».

Redaktörer granskar och hanterar förslagen; du behöver inte göra mer efter inskick.

### Användarfall

**«Jag hittade en ny stig som saknas på kartan»**

1. Öppna området → **Föreslå ändring**.
2. Rita stigen som linje (eller importera GPS-spår).
3. Lägg till kort text: «Ny stig väster om sjön, ca 200 m».
4. Bifoga foto om möjligt.
5. Skicka in.

### Övning

- [ ] Öppna kartförslag på ett område med publicerad karta.
- [ ] Rita minst ett objekt (punkt eller linje).
- [ ] Skicka in ett testförslag (eller spara utkast mentalt om du inte vill skicka skarpt).
- [ ] Hitta förslaget i listan på områdessidan.

### Bilder

**[BILD 3.1]** Områdessidan: knappen «Föreslå ändring» i sidhuvudet bredvid andra åtgärder.

**[BILD 3.2]** Kartförslagsvyn: ritverktyg till höger, «Skicka in» uppe till höger, karta i mitten.

**[BILD 3.3]** Lista över kartförslag med status (t.ex. «Väntar på granskning»).

---

## Modul 1.4 — Lägg bana

### Teori

Banor ritas ovanpå kartans **publicerade** version. Banor sparas separat och **påverkar aldrig** kartfilen.

1. På områdessidan: **Lägg bana** (eller **Banor (N)** om banor redan finns).
2. Välj symbol i panelen till höger (701–709, IOF magenta).
3. Verktyg: **Rita**, **Flytta**, **Klipp**, **Radera**.
4. Lägg **start** (701), **kontroller** (703), **mål** (706) — banlinjer dras automatiskt.
5. **Klipp:** skapa luckor i kontrollcirkel eller sträcka så kartsymboler under syns; dra grön markör för att flytta lucka.
6. Spara bana, välj **Gör publik** om andra ska se den.
7. **Skuggbana:** visa annan bana halvtransparent för jämförelse.
8. **PDF-export** längst ned i banredigeraren.

### Användarfall

**«Jag ska lägga en träningsbana på publicerad karta»**

1. Öppna **Lägg bana**.
2. Placera start och kontroller i terrängen.
3. Använd **Klipp** där kontrollcirklar täcker stenar eller höjder.
4. Spara med namn t.ex. «Träning 2026-03-15».
5. Exportera PDF till utskrift om behövs.

### Övning

- [ ] Öppna banredigeraren på ett område med publicerad karta.
- [ ] Lägg minst start + 2 kontroller + mål.
- [ ] Testa **Klipp** på minst en kontroll eller sträcka.
- [ ] Spara banan.
- [ ] (Valfritt) Exportera PDF.

### Bilder

**[BILD 4.1]** Områdessidan: knapparna «Arkivera», «Checka ut», «Lägg bana»/«Banor (2)», «Föreslå ändring».

**[BILD 4.2]** Banredigeraren: verktygsrad (Rita, Flytta, Klipp, Radera), kontrollista, symbolpanel.

**[BILD 4.3]** Bana med kontrollcirkel och lucka (Klipp) — kartsymbol syns genom luckan.

**[BILD 4.4]** (Valfritt) Skuggbana vald i rullgardinsmenyn, halvtransparent overlay.

---

## Modul 1.5 — Export och verifiera

### Teori

**Export från kartvyn**

- Välj utsnitt på kartan.
- Exportera som **PDF**, **OCAD (.ocd)** eller **GeoTIFF (.tif)** beroende på behov.

**Verifiera** (`/verifiera`)

- Jämför **två .ocd-filer** tillfälligt utan att spara dem som version i systemet.
- Bra innan du skickar fil till någon som ska ladda upp.

**Jämföra versioner** (inom systemet)

- På områdessidan: välj två versioner i jämförelseväljaren.
- Diff visar tillagda (grönt), borttagna (rött) och ändrade objekt.

### Användarfall

**«Jag vill skriva ut ett utsnitt till banläggning på papper»**

1. Öppna publicerad kartversion i kartvyn.
2. Zooma till önskat område.
3. Exportera som PDF.

### Övning

- [ ] Exportera ett kartutsnitt (PDF räcker).
- [ ] (Valfritt) Öppna **Verifiera** och ladda upp två lokala .ocd-filer.
- [ ] (Valfritt) Jämför två versioner på ett område du har tillgång till.

### Bilder

**[BILD 5.1]** Exportdialog i kartvyn med val av format (PDF / OCAD / GeoTIFF).

**[BILD 5.2]** Sidan Verifiera med uppladdning av två filer och diff-resultat.

**[BILD 5.3]** (Valfritt) Jämförelsevy mellan två versioner med färgkodad diff.

---

## Del 1 — Slutchecklista

När du kan bocka av allt nedan är del 1 klar:

- [ ] Logga in och förstå min roll som läsare
- [ ] Hitta område och öppna publicerad kartversion
- [ ] Skicka in (eller simulera) ett kartförslag
- [ ] Skapa och spara en bana med minst tre kontroller
- [ ] Använda Klipp minst en gång
- [ ] Exportera ett kartutsnitt

---

# Del 2 — Redaktör

> **Mål:** Du ska kunna ladda upp och publicera kartversioner, arbeta med utcheckning/incheckning och granska kartförslag.
>
> **Förutsättning:** Genomför [Del 1](#del-1--läsare) först.

---

## Modul 2.1 — Ladda upp och granska versioner

### Teori

- Varje uppladdning av en **.ocd-fil** skapar en **ny version**. Tidigare versioner behålls.
- Nya versioner är **opublicerade** tills du publicerar dem.
- Efter uppladdning jämförs automatiskt med föregående version (**diff**).
- Du ser **alla** versioner (även opublicerade); läsare ser bara publicerade.

Steg:

1. Öppna områdessidan.
2. Under **Ladda upp ny version**: välj fil, valfri kommentar, ladda upp.
3. Vänta tills parsning är klar (objektantal syns).
4. Granska diff mot föregående version.

### Användarfall

**«Ny terränginventering — ladda upp och granska vad som ändrats»**

1. Ladda upp ny .ocd efter inventering.
2. Öppna diff: kontrollera att ändringar stämmer.
3. Ladda ner versionen om du behöver backup lokalt.

### Övning

- [ ] Ladda upp en testversion ( eller använd befintlig omredigering).
- [ ] Granska diff mot föregående version.
- [ ] Läs versionskommentar och metadata (uppladdare, datum, storlek).

### Bilder

**[BILD 6.1]** Områdessidan: avsnittet «Ladda upp ny version» med filväljare och kommentarsfält.

**[BILD 6.2]** Diff-vy efter uppladdning: grönt = tillagt, rött = borttaget, gult = ändrat.

**[BILD 6.3]** Versionshistorik med både publicerade och opublicerade rader.

---

## Modul 2.2 — Publicering

### Teori

- Bara **en version åt gången** kan vara **publicerad** per område.
- När du publicerar en ny version **avpubliceras** den tidigare automatiskt.
- **Läsare** och funktioner som **Lägg bana** / **Kartförslag** använder den publicerade versionen.
- **Rekommenderad version** kan markeras separat (vägledning, inte samma som publicerad).

### Användarfall

**«Terrängcup-kartan är klar — publicera så tränare kan lägga banor»**

1. Kontrollera diff och att versionen är korrekt.
2. Klicka **Publicera** på versionsraden.
3. Kontrollera statusbanner på områdessidan: «Publicerad version vN».

### Övning

- [ ] Publicera en opublicerad version ( i testmiljö om möjligt).
- [ ] Verifiera att områdesstatus uppdaterats.
- [ ] (Valfritt) Avpublicera och publicera igen för att se beteendet.

### Bilder

**[BILD 7.1]** Versionsrad med knapp «Publicera» och badge «Publicerad».

**[BILD 7.2]** AreaStatusBanner: «Publicerad version v3», ev. antal väntande kartförslag.

---

## Modul 2.3 — Utcheckning och incheckning

### Teori

Utcheckning låter flera redaktörer arbeta parallellt i OCAD på **olika delar** av samma karta.

**Checka ut**

1. På områdessidan: **Checka ut område**.
2. Rita polygon på kartan (området du reserverar).
3. Ladda ner **utchecknings-.ocd**.
4. Redigera i OCAD lokalt.

**Medan utcheckning pågår**

- Andra redaktörer ser din yta på **översiktskartan** (read-only).
- Du ser andras utcheckningar.

**Checka in**

1. Öppna utcheckningen från listan.
2. Ladda upp uppdaterad .ocd.
3. Granska **diff** (utcheckad vs inlämnad).
4. **Bekräfta** — ändringen väntar på administratörs **integration**.

### Användarfall

**«Jag ska uppdatera norra delen medan kollegan har södra»**

1. Checka ut norra polygonen.
2. Redigera i OCAD.
3. Checka in och bekräfta diff.
4. Informera admin att incheckning väntar på integration.

### Övning

- [ ] Starta en utcheckning (testpolygon räcker).
- [ ] Hitta utcheckningen i listan och översiktskartan.
- [ ] (Valfritt) Genomför incheckning med fil om du har test-.ocd.

### Bilder

**[BILD 8.1]** Utcheckning: rita polygon på kartan, bekräfta utcheckning.

**[BILD 8.2]** Översiktskarta med färgade utcheckningsytor och namn.

**[BILD 8.3]** Incheckning: diff mellan utcheckad fil och inlämnad fil.

**[BILD 8.4]** Utcheckningslistan på områdessidan med status «Aktiv».

---

## Modul 2.4 — Granska kartförslag

### Teori

- Alla godkända användare kan skicka **kartförslag**; redaktörer **granskar** dem.
- På områdessidan: se antal väntande förslag i statusbanner och under avsnittet **Kartförslag**.
- Öppna enskilt förslag: se ritning, text, foto, GPS.
- Markera som hanterat / gransat enligt ert arbetssätt.
- Exportera **PDF-rapport** över kartförslag vid behov.

Integrering i kartfil sker manuellt i OCAD och via ny version — förslagen sparas separat.

### Användarfall

**«Tränare skickade stigförslag — bedöm om det ska in i nästa version»**

1. Öppna förslaget på kartan.
2. Jämför med publicerad karta.
3. Besluta: ta med i nästa inventering / avvisa / komplettera med fråga till avsändaren.

### Övning

- [ ] Hitta lista över kartförslag på ett område.
- [ ] Öppna minst ett förslag och granska innehållet.
- [ ] (Valfritt) Exportera PDF-rapport.

### Bilder

**[BILD 9.1]** Områdessidan: kartförslagssektion med antal väntande.

**[BILD 9.2]** Detaljvy för ett kartförslag med karta, beskrivning och bifogat foto.

---

## Modul 2.5 — Jämföra versioner och rekommendation

### Teori

- **Jämförelseväljaren** på områdessidan: välj två versioner → öppna jämförelsevy.
- Exportera diff som PDF för dokumentation.
- **Rekommenderad version** — markera vilken version som bör användas som referens ( separat från publicerad).

### Användarfall

**«Vad ändrades mellan v2 och v3?»**

1. Välj version 2 och 3 i jämförelseväljaren.
2. Granska diff i kartvy.
3. Exportera PDF om du behöver dela med kartgruppen.

### Övning

- [ ] Jämför två valfria versioner på samma område.
- [ ] Identifiera minst tre typer av ändringar i diff.

### Bilder

**[BILD 10.1]** Versionsjämförelse: väljare + kartvy med diff.

**[BILD 10.2]** (Valfritt) PDF-export av versionsdiff.

---

## Del 2 — Slutchecklista

- [ ] Laddat upp version och granskat diff
- [ ] Publicerat (eller förstått flödet för) en version
- [ ] Checkat ut och förstått översiktskartan
- [ ] Granskat minst ett kartförslag
- [ ] Jämfört två versioner i diff-vyn

---

# Del 3 — Administratör

> **Mål:** Du ska kunna hantera användare, områden, integrera incheckningar och övervaka systemet.
>
> **Förutsättning:** Genomför [Del 2](#del-2--redaktör) först.

---

## Modul 3.1 — Användare och konton

### Teori

- Nya konton hamnar i **Väntar på godkännande**.
- Admin → **Användare**: godkänn, avvisa eller ändra roll.
- Roller: **Läsare**, **Redaktör**, **Administratör**.
- Vid godkännande skickas e-post ( om SMTP är konfigurerat ) med tilldelad roll.
- Admin kan även återställa lösenord och hantera avvisade konton.

### Användarfall

**«Ny tränare registrerad — ge läsarbehörighet»**

1. Admin → Användare.
2. Hitta pending-konto.
3. Godkänn med roll **Läsare**.
4. Bekräfta att användaren kan logga in.

### Övning

- [ ] Öppna Admin → Användare.
- [ ] Identifiera kolumner: namn, e-post, roll, status.
- [ ] (I testmiljö) Godkänn ett testkonto med lämplig roll.

### Bilder

**[BILD 11.1]** Admin → Användare: tabell med filter «Väntar på godkännande».

**[BILD 11.2]** Dialog för godkännande: välj roll Läsare / Redaktör / Administratör.

---

## Modul 3.2 — Områden, namn och arkivering

### Teori

- **Skapa område:** under startsidan, formulär «Skapa nytt kartområde» (namn + beskrivning).
- Första .ocd laddas upp på områdets detaljsida — inte vid skapandet.
- **Byta namn:** ikonen «Redigera namn» vid titeln ( URL/slug ändras inte ).
- **Arkivera område:** döljer för normal användning; admin kan återställa.
- **Radera område:** permanent — alla versioner, banor, utcheckningar m.m. försvinner.

### Användarfall

**«Nytt kartprojekt Siljansnäs 2026»**

1. Skapa område «Siljansnäs 2026» med kort beskrivning.
2. Be redaktör ladda upp första versionen.
3. Publicera när klar.

### Övning

- [ ] (Testmiljö) Skapa område eller granska befintligt.
- [ ] Förstå skillnad arkivera vs radera.
- [ ] Hitta «Arkivera område» på områdessidan.

### Bilder

**[BILD 12.1]** Startsidan: «Skapa nytt kartområde» under listan.

**[BILD 12.2]** Områdessidan: «Arkivera område» och meddelande om arkiverat område.

**[BILD 12.3]** (Valfritt) Redigera namn vid sidtitel.

---

## Modul 3.3 — Utcheckningar och integration

### Teori

**Redaktörens del:** checka ut → redigera → checka in → bekräfta diff.

**Administratörens del:**

- **Avbryt utcheckning** om någon blockerar eller slutat arbeta.
- **Integrera incheckning** — slår ihop godkänd incheckning till ny kartversion i systemet.
- Admin → **Utcheckningar** — översikt över alla aktiva och väntande.

Efter integration skapas ny version; redaktör kan publicera den.

### Användarfall

**«Redaktör checkade in norra delen — integrera till huvudversion»**

1. Admin → Utcheckningar ( eller områdessidan ).
2. Öppna incheckning med status «Väntar på integration».
3. Granska diff en sista gång.
4. **Integrera** → ny versionsnummer skapas.
5. Informera redaktör att publicera vid behov.

### Övning

- [ ] Hitta Admin → Utcheckningar.
- [ ] Förstå skillnad: aktiv utcheckning / incheckad väntar / integrerad.
- [ ] (Valfritt) Genomför integration i testmiljö.

### Bilder

**[BILD 13.1]** Admin → Utcheckningar: lista med statuskolumner.

**[BILD 13.2]** Integrera incheckning: bekräftelsedialog och resultat «Version vN skapad».

**[BILD 13.3]** (Valfritt) Avbryt utcheckning — adminåtgärd.

---

## Modul 3.4 — System, lagring och feedback

### Teori

| Admin-sida | Syfte |
|------------|--------|
| **Inställningar** | SMTP, e-postmallar, testa utskick |
| **Lagring** | Förbrukning per område, versioner, banor |
| **Loggning** | Audit-logg, felsökning |
| **Feedback** | Användares buggar och förbättringsförslag |
| **Utcheckningar** | Se modul 3.3 |

Användare når feedback via **Hjälp → Buggar / Förbättringar**.

### Användarfall

**«Kolla att lagringen inte närmar sig gräns»**

1. Admin → Lagring.
2. Sortera på största områden.
3. Överväg arkivering av gamla projekt.

### Övning

- [ ] Besök Admin → Lagring och Inställningar.
- [ ] Hitta var SMTP testas.
- [ ] (Valfritt) Läs igenom senaste loggposter.

### Bilder

**[BILD 14.1]** Admin → Lagring: tabell med områden, antal versioner, banor, storlek.

**[BILD 14.2]** Admin → Inställningar: SMTP-fält och «Skicka testmail».

**[BILD 14.3]** (Valfritt) Admin → Loggning eller Feedback.

---

## Modul 3.5 — Publicering och helhetsflöde (adminperspektiv)

### Teori — typiskt kartprojekt

```
Skapa område (admin)
    → Ladda upp v1 (redaktör)
    → Publicera (redaktör)
    → Parallellt: kartförslag + banor (läsare/tränare)
    → Utcheckningar (redaktörer)
    → Integration (admin)
    → Publicera ny version (redaktör)
```

### Användarfall

**«Säsongstart — alla ska komma igång»**

1. Kontrollera att rätt version är publicerad på alla aktiva områden.
2. Godkänn nya konton.
3. Kommunicera länk till `/hjalp/guide` och detta kursmaterial.

### Bilder

**[BILD 15.1]** (Valfritt) Översiktsdiagram: roller och huvudflöden ( kan återanvända schema från hjälpen ).

---

## Del 3 — Slutchecklista

- [ ] Godkänt konto med korrekt roll
- [ ] Skapat eller förvaltat område ( skapa / arkivera )
- [ ] Förstått integrationsflöde för incheckning
- [ ] Besökt lagring och inställningar
- [ ] Kan beskiva hela flödet från uppladdning till publicering för en ny karta

---

# Bilaga A — Snabbreferens per funktion

| Funktion | Läsare | Redaktör | Admin | Var |
|----------|:------:|:--------:|:-----:|-----|
| Se publicerad karta | ✓ | ✓ | ✓ | Startsida → område → kartvy |
| Kartförslag | ✓ | ✓ | ✓ | Områdessida → Föreslå ändring |
| Lägg bana | ✓ | ✓ | ✓ | Områdessida → Lägg bana / Banor (N) |
| Export PDF/OCAD/GeoTIFF | ✓ | ✓ | ✓ | Kartvy |
| Verifiera (.ocd) | ✓ | ✓ | ✓ | `/verifiera` |
| Jämför versioner | ✓* | ✓ | ✓ | Områdessida |
| Ladda upp version | | ✓ | ✓ | Områdessida |
| Publicera | | ✓ | ✓ | Versionshistorik |
| Utcheckning/incheckning | | ✓ | ✓ | Områdessida |
| Granska kartförslag | | ✓ | ✓ | Områdessida |
| Skapa område | | | ✓ | Startsida |
| Godkänn användare | | | ✓ | Admin → Användare |
| Integrera incheckning | | | ✓ | Admin / områdessida |
| Systeminställningar | | | ✓ | Admin → Inställningar |

\* Läsare ser bara publicerade versioner i jämförelse.

---

# Bilaga B — Bildindex ( för dig som klistrar in skärmdumpar )

| Bild-ID | Del | Beskrivning |
|---------|-----|-------------|
| 1.1 | 1 | Inloggning, skapa konto |
| 1.2 | 1 | Profildialog, läsare |
| 2.1 | 1 | Startsida, områdeslista |
| 2.2 | 1 | Versionshistorik, publicerad |
| 2.3 | 1 | Kartvy |
| 3.1 | 1 | Knappen Föreslå ändring |
| 3.2 | 1 | Kartförslagsvy, ritverktyg |
| 3.3 | 1 | Lista kartförslag |
| 4.1 | 1 | Sidhuvud knappar inkl. Lägg bana |
| 4.2 | 1 | Banredigerare |
| 4.3 | 1 | Klipp / lucka i kontroll |
| 4.4 | 1 | Skuggbana (valfritt) |
| 5.1 | 1 | Exportdialog |
| 5.2 | 1 | Verifiera |
| 5.3 | 1 | Versionsdiff (valfritt) |
| 6.1 | 2 | Ladda upp version |
| 6.2 | 2 | Diff efter uppladdning |
| 6.3 | 2 | Versionshistorik alla status |
| 7.1 | 2 | Publicera-knapp |
| 7.2 | 2 | Statusbanner publicerad |
| 8.1 | 2 | Utcheckning polygon |
| 8.2 | 2 | Översiktskarta utcheckningar |
| 8.3 | 2 | Incheckning diff |
| 8.4 | 2 | Utcheckningslista |
| 9.1 | 2 | Kartförslag antal |
| 9.2 | 2 | Kartförslag detalj |
| 10.1 | 2 | Jämförelse två versioner |
| 10.2 | 2 | Diff-PDF (valfritt) |
| 11.1 | 3 | Admin användare pending |
| 11.2 | 3 | Godkänn roll |
| 12.1 | 3 | Skapa område |
| 12.2 | 3 | Arkivera område |
| 12.3 | 3 | Redigera namn (valfritt) |
| 13.1 | 3 | Admin utcheckningar |
| 13.2 | 3 | Integrera incheckning |
| 13.3 | 3 | Avbryt utcheckning (valfritt) |
| 14.1 | 3 | Admin lagring |
| 14.2 | 3 | Admin inställningar SMTP |
| 14.3 | 3 | Loggning/feedback (valfritt) |
| 15.1 | 3 | Flödesdiagram (valfritt) |

**Tips vid inklistring:** Ersätt raden `[BILD X.Y]` med `![Bildtext](sökväg/till/bild.png)` eller klistra in bilden direkt om editorn stödjer det.

---

# Bilaga C — Felsökning ( vanliga problem )

| Problem | Möjlig orsak | Åtgärd |
|---------|--------------|--------|
| Ser inget område | Ingen publicerad version | Be redaktör publicera |
| «Lägg bana» inaktiv | Ingen publicerad version | Publicera kartversion först |
| Kan inte ladda upp | Du är läsare | Be om redaktörsbehörighet |
| Utcheckning går inte | Ingen version på området | Ladda upp minst en version |
| Får inget e-post | SMTP ej konfigurerat / notiser av | Admin kontrollerar inställningar; kolla spam |
| Konto väntar | Ej godkänt | Admin godkänner under Användare |

---

*Senast uppdaterad: 2026-08-31. Matchar Kartbanken inkl. Klipp-verktyg i banläggning och knapp «Lägg bana» / «Banor (N)» i sidhuvudet.*
