# PRD: OCAD-kartfilshanterare

> **Status:** v0.6 — Lägg bana (banoverlay-redigerare)  
> **Senast uppdaterad:** 2026-08-02  
> **Domän:** kartor.ifkmora.se  
> **Implementation:** [docs/mvp-tickets.md](docs/mvp-tickets.md)  
> **Exempelfil:** `Exempelfil/ORIGINAL_Mora_Väst_med_Venjan_ISOM2017-6-2_20260227_ocad12.ocd`

---

## 1. Sammanfattning

Vi behöver ett webbaserat verktyg för att hantera OCAD-kartfiler (`.ocd`) som flera personer justerar parallellt. Verktyget ska:

- Bevara **alla historiska versioner** när nya filer laddas upp
- Möjliggöra **jämförelse** mellan versioner för att granska ändringar
- Kräva **inloggning med e-post och lösenord** för att identifiera vem som gjort vad
- Låta användare **registrera sig själva** (väntar på admin-godkännande) eller låta **administratören skapa konton manuellt** med tilldelad rättighetsnivå (Reader, Editor, Admin)
- Möjliggöra **checkout/checkin** av kartområden så att flera redaktörer kan arbeta parallellt i OCAD Desktop utan att skriva över varandra
- Låta inloggade användare **lägga banor** som overlay ovanpå kartan (symboler 700–709) utan att ändra underliggande `.ocd`

Detta dokument beskriver vision, krav och öppna frågor inför implementation.

---

## 2. Problem

| Problem | Konsekvens idag |
|--------|------------------|
| Flera personer redigerar samma kartfil offline | Risk för att skriva över varandras arbete |
| Ingen central versionshistorik | Svårt att veta vilken fil som är "senaste sanningen" |
| Ingen spårbarhet | Okänt vem som gjorde vilken ändring och när |
| Ingen enkel granskning av ändringar | Manuell öppning i OCAD/PDF krävs för att jämföra |
| Otydliga åtkomsträttigheter | Alla har samma möjligheter eller filer delas via e-post/moln ad hoc |
| Banplanering sker i OCAD eller på papper | Svårt att dela utkast; ingen gemensam vy ovanpå senaste kartan |

**Exempel från verkligheten:**  
Filnamn som `ORIGINAL_Mora_Väst_med_Venjan_ISOM2017-6-2_20260227_ocad12.ocd` visar att version, datum och OCAD-version redan kodas manuellt i filnamnet — ett tecken på att vi saknar ett dedikerat versionshanteringssystem.

---

## 3. Mål och icke-mål

### Mål (v1)

- [ ] Central plats för alla kartfiler och deras versioner
- [ ] Säker inloggning med e-post och lösenord (Auth.js Credentials, bcrypt)
- [ ] Självregistrering med admin-godkännande (konto skapas som PENDING, admin tilldelar roll)
- [ ] Admin kan skapa användarkonton manuellt och tilldela rättighetsnivå vid skapande
- [ ] Uppladdning skapar ny version utan att radera tidigare
- [ ] Nedladdning av valfri version
- [ ] **Innehållsjämförelse** av `.ocd`-filer — redovisa tillagda, borttagna och ändrade kartobjekt
- [ ] Visuell kartpreview i jämförelsevyn (SVG)
- [ ] Auditlogg: vem laddade upp/laddade ner vad och när
- [ ] **Checkout/checkin** av kartområden med exklusiva lås, subset-export och kontrollerad integration (se §18)
- [ ] **Lägg bana** — overlay-redigerare för orienteringsbanor ovanpå senaste karta (symboler 700–709), spara/dela banor, PDF-export (se §20)

### Icke-mål (v1)

- Redigera OCAD-filer direkt i webbläsaren
- Ersätta OCAD Desktop som kartredigeringsverktyg
- Automatisk merge/konfliktlösning utan mänsklig bekräftelse (integration kräver dubbel bekräftelse, se §18)
- Pixel-perfekt diff identisk med OCAD Desktop (vår diff baseras på parser, inte OCAD-motorn)
- Redigera OCAD-filer i webbläsaren
- Ändra underliggande `.ocd` via banoverlay (overlay påverkar aldrig kartfilen)
- Importera/exportera banor till OCAD `.ocd`-format (endast overlay-lager + PDF i v1)

---

## 4. Användare och roller

| Roll | Beskrivning | Typiska behov |
|------|-------------|---------------|
| **Läsare (Reader)** | Nedladdning, se lås, **lägga banor** | Hämta senaste eller historisk version; se aktiva checkout-områden (vem, när) men kan inte checka ut; skapa egna banor som overlay |
| **Redaktör (Editor)** | Uppladdning + checkout | Checka ut eget område, redigera subset i OCAD Desktop, checka in och bekräfta integration |
| **Administratör (Admin)** | Full kontroll | Allt Editor kan + checka ut valfritt område, avbryta andras checkout, bekräfta integration |

> **Självregistrering (v1):** Nya användare kan skapa konto själva. Kontot får rollen *PENDING* och kan inte logga in förrän en administratör godkänner och tilldelar roll (Reader, Editor eller Admin). Admin får e-postnotis vid ny registrering (Gmail SMTP, se README).

### Personas (exempel)

1. **Kartansvarig (Admin)** — koordinerar vem som får ladda upp, granskar ändringar före "officiell" version markeras.
2. **Fältkartograf (Editor)** — varit ute i terrängen, gjort justeringar i OCAD Desktop, laddar upp ny `.ocd`.
3. **Tävlingsledare (Reader)** — behöver senaste godkända kartan inför arrangemang, laddar bara ner; kan lägga utkast till bana direkt på kartan.
4. **Banläggare (Reader/Editor)** — planerar kontroller och sträckning; vill se banan ovanpå senaste kartan och dela med kollegor.

---

## 5. Användarflöden

### 5.1 Konto skapas och första inloggning

```
Admin → /admin/users → Skapa konto (e-post, tillfälligt lösenord, roll: Reader/Editor/Admin)
      → Användaren får inloggningsuppgifter (t.ex. via e-post utanför systemet)

Användare → /login → Ange e-post + lösenord → Auth.js Credentials → JWT-session
          → Omdirigeras till dashboard enligt tilldelad roll
```

> **Bootstrap:** Vid första deploy seedas **`buud212@gmail.com`** som Admin med lösenord via miljövariabel eller migrations-script.

### 5.2 Ladda upp ny version (Editor+)

```
Editor väljer kartfil (t.ex. "Mora Väst med Venjan")
         → Väljer lokal .ocd-fil
         → Fyller i valfri kommentar ("Justerat stig vid sjön, v2026-08-01")
         → System validerar filtyp/storlek
         → Ny version sparas (v3, v4, …) — gamla versioner kvar
         → Auditlogg uppdateras
         → (Valfritt) Notis till admin/abonnenter
```

### 5.3 Jämför versioner

```
Användare öppnar kartfil → väljer "Version A" och "Version B"
         → System visar jämförelsevy
         → Användare kan bedöma om ändringarna är avsedda
```

### 5.4 Ladda ner

```
Användare (Reader+) → väljer kartfil → väljer version (default: senaste)
                    → Nedladdning startar med tydligt filnamn
```

### 5.5 Checka ut område (Editor+)

```
Editor öppnar kartfil → ser befintliga checkout-områden (overlay)
         → Rita rektangel eller polygon på kartan
         → System kontrollerar att området inte överlappar aktiv checkout
         → Checkout skapas (exklusivt lås) mot aktuell head-version
         → Subset .ocd genereras och laddas ner
         → E-postnotis till checkout-användare + admin
```

### 5.6 Redigera offline i OCAD

```
Editor öppnar subset .ocd i OCAD Desktop
         → Gör ändringar endast inom checkat område
         → Sparar lokalt (ingen webbinteraktion under redigering)
```

### 5.7 Checka in och granska diff

```
Editor → "Checka in" → laddar upp redigerad subset .ocd
       → System diffar endast objekt som ingick i checkout
       → Diff visas mot senaste head-version (rebase/merge-förberedelse)
       → Editor granskar ändringar och bekräfta att de ska integreras
       → E-postnotis: checkin inskickad
```

### 5.8 Dubbel bekräftelse och integration (Editor + Admin)

```
Editor bekräftar integration av sina ändringar
         → Status: väntar på admin-bekräftelse
Admin granskar diff → bekräftar integration
         → System applicerar ändringar mot senaste version → ny MapVersion skapas
         → Checkout stängs (lås frigörs)
         → E-postnotis: integration genomförd
```

> **Alternativ:** Admin kan avbryta checkout (force release) — lås frigörs utan integration; e-postnotis skickas.

### 5.9 Lägg bana (overlay-redigerare)

```
Användare (Reader+) öppnar kartfil → "Hela kartan" / kartvy
         → Växlar till läge "Lägg bana"
         → Kartan visar alltid senaste head-version som bakgrund
         → Symbolpanel till höger: symboler 700–709 (start, kontroll, mål, …)
         → Väljer symbol → klick/placering (punkt) eller ritar linje/yta
         → Textsymbol → modal för textinmatning
         → Verktyg: flytta, radera
         → Sparar bana med namn (ägs av användaren; standard: privat)
         → Valfritt: kryssruta "Gör publik" → synlig för alla på samma kartfil
```

### 5.10 Jämför med skuggbana

```
Användare redigerar eller visar aktiv bana
         → Väljer valfri annan sparad bana som "skuggbana"
         → Skuggbana ritas halvtransparent ovanpå kartan (endast visning)
         → Aktiv bana förblir redigerbar; skuggbana är read-only
```

### 5.11 Kontrollista och PDF-export

```
Användare har sparad bana med kontrollsymboler (700–709)
         → System bygger kontrollista: nummer 1, 2, 3 … i placeringsordning
         → Användare exporterar bana till PDF
         → Väljer format: A4 eller A3, liggande eller stående
         → Väljer skala (t.ex. 1:7500, 1:10000)
         → PDF innehåller karta + overlay + (valfritt) kontrollista
```

---

## 6. Funktionella krav

### 6.1 Autentisering

| ID | Krav | Prioritet |
|----|------|-----------|
| AUTH-1 | Inloggning via Auth.js **Credentials**-provider (e-post + lösenord) | Must |
| AUTH-2 | Lösenord lagras **hashat** med bcrypt; aldrig i klartext | Must |
| AUTH-3 | Session hanteras med **JWT** (Auth.js), HTTPS | Must |
| AUTH-4 | Utloggning ska finnas | Should |
| AUTH-5 | Endast admin kan skapa nya användarkonton | Must |
| AUTH-6 | Roll tilldelas vid kontoskapande (Reader, Editor eller Admin) — ingen väntande status i v1 | Must |

### 6.2 Auktorisering (RBAC)

| ID | Krav | Prioritet |
|----|------|-----------|
| RBAC-1 | Roller i v1: `reader`, `editor`, `admin` *(rollen `pending` reserveras för framtida självregistrering)* | Must |
| RBAC-2 | Admin kan ändra roll för valfri användare | Must |
| RBAC-3 | Initial admin **`buud212@gmail.com`** seedas vid deploy | Must |
| RBAC-4 | Endast `editor` och `admin` kan ladda upp | Must |
| RBAC-5 | `reader`, `editor`, `admin` kan ladda ner | Must |

### 6.3 Kartfiler och versioner

| ID | Krav | Prioritet |
|----|------|-----------|
| FILE-1 | Stöd filformat `.ocd` (OCAD 12+ baserat på exempel) | Must |
| FILE-2 | Varje uppladdning = ny version; gamla versioner **raderas aldrig** automatiskt | Must |
| FILE-3 | Metadata per version: uppladdare, tidpunkt, kommentar, filstorlek, filnamn | Must |
| FILE-4 | Kartfiler grupperas logiskt (t.ex. "Mora Väst med Venjan") — inte bara filnamn | Must |
| FILE-5 | Max filstorlek definieras (t.ex. 100 MB; exempelfil ~21 MB) | Must |
| FILE-6 | Admin kan markera en version som "aktuell/rekommenderad" | Should |
| FILE-7 | Admin kan arkivera/soft-delete en hel kartfil | Could |

### 6.4 Jämförelse (OCD-innehåll)

| ID | Krav | Prioritet |
|----|------|-----------|
| DIFF-1 | Välj två versioner av samma kartfil | Must |
| DIFF-2 | Parsa båda `.ocd`-filerna och extrahera kartobjekt | Must |
| DIFF-3 | Redovisa **tillagda** objekt (finns i B, saknas i A) | Must |
| DIFF-4 | Redovisa **borttagna** objekt (finns i A, saknas i B) | Must |
| DIFF-5 | Redovisa **ändrade** objekt (samma ungefärliga position, men ändrad geometri, symbol eller text) | Must |
| DIFF-6 | Summering per symboltyp (t.ex. "Stig 506: +3, −1, ~2") | Must |
| DIFF-7 | Visa metadata (datum, uppladdare, kommentar) som komplement | Must |
| DIFF-8 | Visuell kartpreview — SVG sida vid sida med markering av ändrade områden | Must |
| DIFF-9 | Zooma/pana i preview till ändrat område ("hoppa till ändring") | Should |
| DIFF-10 | Cacha diff-resultat (tung beräkning) | Should |
| DIFF-11 | Export av jämförelserapport (PDF) | Could |

> **Teknik:** Biblioteket [`ocad2geojson`](https://github.com/perliedman/ocad2geojson) parsar OCAD 10–12 och kan exportera GeoJSON/SVG. Vi jämför extraherade objekt (symbolnummer, typ, geometri, text) mellan versioner. Diff körs asynkront vid uppladdning eller på begäran och sparas i databasen.
>
> **Licensnotering:** `ocad2geojson` är AGPL-3.0 — vid drift av webbtjänsten måste källkod tillgängliggöras enligt licensen.

### 6.5 Audit och spårbarhet

| ID | Krav | Prioritet |
|----|------|-----------|
| AUDIT-1 | Logga: inloggning, uppladdning, nedladdning, rolländring | Must |
| AUDIT-2 | Admin kan se auditlogg filtrerad per användare/kartfil | Should |

### 6.6 Adminpanel

| ID | Krav | Prioritet |
|----|------|-----------|
| ADMIN-1 | Skapa användarkonto: e-post, lösenord (eller genererat), namn, roll | Must |
| ADMIN-2 | Lista alla användare; ändra roll; inaktivera konto | Must |
| ADMIN-3 | Översikt alla kartfiler och senaste version | Must |
| ADMIN-4 | (Framtid) Självregistrering / Google OAuth med godkännandeflöde | Could |
| ADMIN-5 | (Framtid) Bjud in användare via e-post | Could |

### 6.7 Checkout/checkin

| ID | Krav | Prioritet |
|----|------|-----------|
| CHECKOUT-1 | Editor kan checka ut ett **område** (rektangel eller polygon) på kartan | Must |
| CHECKOUT-2 | Export vid checkout ska vara **subset .ocd** (endast objekt inom området), inte hela kartan | Must |
| CHECKOUT-3 | Checkout är **exklusivt** — inga överlappande checkouts på samma objekt/område | Must |
| CHECKOUT-4 | Aktiva checkout-områden ska vara **synliga för alla inloggade** (vem, sedan när, status) | Must |
| CHECKOUT-5 | Checkout baseras alltid på **senaste version** (head); vid checkin integreras mot aktuell head (rebase/merge) | Must |
| CHECKOUT-6 | Diff vid checkin sker **endast på objekt som ingick i checkout** | Must |
| CHECKOUT-7 | Integration kräver **bekräftelse av utcheckande användare** innan den blir aktiv | Must |
| CHECKOUT-8 | Integration kräver **bekräftelse av admin** efter användarens bekräftelse | Must |
| CHECKOUT-9 | Admin kan **avbryta/radera checkout** (force release) utan integration | Must |
| CHECKOUT-10 | E-postnotis vid **alla checkout-händelser**: skapad, checkin inskickad, integration bekräftad, avbruten av admin | Must |
| CHECKOUT-11 | **Automatisk påminnelse** via e-post efter X dagar utan checkin (konfigurerbart, default 7) | Must |
| CHECKOUT-12 | Fullständig uppladdning av hel karta **tillåten** men ska visa **varning** om aktiva checkouts finns | Must |
| CHECKOUT-13 | Reader ser lås men kan **inte** checka ut | Must |
| CHECKOUT-14 | Admin kan checka ut **valfritt område** och avbryta andras checkout | Must |
| CHECKOUT-15 | Objektidentitet vid diff/integration följer samma spatial tolerans som §11 (centroid + symbol) | Must |
| CHECKOUT-16 | Auditlogg för checkout skapad, checkin, integration, avbruten | Must |

> **Teknik:** Subset-export bygger på befintlig OCAD-parser; objekt filtreras via bounding box/polygon-intersect. Integration applicerar ändringar mot parsad head-version och skapar ny MapVersion. Se §18 för detaljer och kantfall.

### 6.8 Lägg bana (banoverlay)

| ID | Krav | Prioritet |
|----|------|-----------|
| COURSE-1 | Läge **"Lägg bana"** i kartvyn ("Hela kartan") för inloggade användare | Must |
| COURSE-2 | Bakgrundskarta är alltid **senaste head-version** (inte låst till specifik version) | Must |
| COURSE-3 | Symbolpanel till **höger** om kartan med symboler **700–709** | Must |
| COURSE-4 | Stöd alla symboltyper v1: **punkt, linje, yta, text** | Must |
| COURSE-5 | Placera punkt genom klick; rita linje/yta genom klick + avsluta | Must |
| COURSE-6 | Textobjekt öppnar **modal** för textinmatning före/efter placering | Must |
| COURSE-7 | Verktyg: **flytta** och **radera** overlay-objekt | Must |
| COURSE-8 | Spara bana med **namn**; användaren **äger** banan | Must |
| COURSE-9 | Standard **privat**; kryssruta **"Gör publik"** vid sparande/redigering | Must |
| COURSE-10 | Publika banor **synliga för alla** inloggade på samma kartfil | Must |
| COURSE-11 | Endast ägare (eller admin) kan redigera/radera egen bana | Must |
| COURSE-12 | Overlay **modifierar aldrig** underliggande `.ocd` | Must |
| COURSE-13 | Visa **en aktiv bana** + valfri **skuggbana** (ghost, read-only) för jämförelse | Must |
| COURSE-14 | **Kontrollista** med auto-numrering 1–2–3 … i **placeringsordning** (kontrollsymboler) | Must |
| COURSE-15 | **PDF-export**: A4 och A3, liggande och stående, **användarvald skala** | Must |
| COURSE-16 | Alla inloggade roller (**Reader, Editor, Admin**) kan skapa banor | Must |
| COURSE-17 | Auditlogg: skapa, uppdatera, radera bana; PDF-export | Should |

> **Teknik:** Overlay lagras som JSON-geometri + symbolnummer i databasen (`Course`, `CourseObject`). Rendering sker ovanpå befintlig SVG-preview från head-version. Symbolutseende approximeras från ISOM/OCAD-definitioner — pixel-perfekt matchning med OCAD Desktop garanteras inte i v1.

---

## 7. Icke-funktionella krav

| Område | Krav |
|--------|------|
| **Säkerhet** | HTTPS, krypterad lagring, principen minsta privilegium |
| **Tillgänglighet** | Svenska UI i v1; engelska kan läggas till senare |
| **Prestanda** | Uppladdning av ~25 MB ska kännas rimlig (< 2 min på normal bredband) |
| **Tillförlitlighet** | Filer får inte förloras; backup av lagring |
| **Enheter** | Responsiv webb — fungerar på laptop och surfplatta |
| **Integritet** | Endast admin-skapade konton med tilldelad roll; inget publikt registreringsformulär i v1 |

---

## 8. Informationsmodell (förslag)

```
User
  - id, email, name, passwordHash
  - role: reader | editor | admin
  - createdAt, createdBy (admin userId)
  - isActive (bool, default true)

MapFile (logisk kartfil)
  - id, slug, title, description
  - createdAt, createdBy

MapVersion
  - id, mapFileId, versionNumber
  - storagePath, originalFilename, fileSizeBytes, contentHash
  - uploadedBy, uploadedAt, comment
  - isRecommended (bool)
  - previewSvgPath          # genererad vid uppladdning
  - objectCount             # antal kartobjekt efter parsning
  - parseStatus: pending | ok | failed
  - parseError              # om parsning misslyckades

VersionDiff                 # cachad jämförelse mellan två versioner
  - id, mapFileId, versionAId, versionBId
  - status: pending | ready | failed
  - summaryJson             # { added: N, removed: N, modified: N, bySymbol: {...} }
  - changesJson             # detaljerad lista (paginerbar)
  - overlaySvgPath          # valfri SVG med markeringar
  - computedAt

AuditLog
  - id, userId, action, targetType, targetId, metadata, timestamp

MapCheckout                    # checkout/checkin av kartområde (§18)
  - id, mapFileId
  - baseVersionId              # version vid checkout (referens; integration sker mot head)
  - checkedOutBy               # userId
  - areaType: rectangle | polygon
  - areaGeometryJson           # koordinater i kart-CRS (GeoJSON Polygon/MultiPolygon)
  - objectIdsJson              # lista över objekt-id:n som ingick i subset vid checkout
  - status: active | checkin_pending | user_confirmed | integrated | cancelled
  - subsetStoragePath          # subset .ocd vid checkout
  - checkinStoragePath         # uppladdad subset .ocd vid checkin (nullable)
  - checkinSubmittedAt
  - userConfirmedAt
  - adminConfirmedAt
  - adminConfirmedBy           # userId (nullable)
  - integratedVersionId        # ny MapVersion efter integration (nullable)
  - cancelledAt, cancelledBy, cancelReason
  - reminderSentAt             # senaste påminnelse skickad
  - createdAt, updatedAt

Course                         # banoverlay på kartfil (§20)
  - id, mapFileId
  - name
  - createdBy                  # userId (ägare)
  - isPublic (bool, default false)
  - createdAt, updatedAt

CourseObject                   # ett overlay-objekt i en bana
  - id, courseId
  - symbolNr                   # 700–709
  - objectType: point | line | area | text
  - geometryJson               # GeoJSON Point/LineString/Polygon i kart-CRS
  - textContent                # nullable; för textsymboler
  - sortOrder                  # placeringsordning (kontrollista)
  - createdAt, updatedAt
```

---

## 9. UI — sidor (förslag v1)

| Sida | Beskrivning | Åtkomst |
|------|-------------|---------|
| `/` | Dashboard: lista kartfiler, senaste aktivitet | Inloggad |
| `/login` | Inloggning med e-post och lösenord | Alla |
| `/maps/:slug` | Detalj: versionshistorik, ladda ner, jämför, ladda upp, **checkout-översikt** | reader+ |
| `/maps/:slug/checkout` | Checka ut område: rita rektangel/polygon, ladda ner subset | editor+ |
| `/maps/:slug/checkout/:id` | Checkout-detalj: status, diff, bekräfta integration | checkout-ägare + admin |
| `/maps/:slug/compare?v1=&v2=` | Jämförelsevy: sammanfattning, objektlista, SVG-preview | reader+ |
| `/admin/users` | Skapa och hantera användarkonton | admin |
| `/admin/audit` | Auditlogg | admin |
| `/admin/checkouts` | (Valfritt) Alla aktiva checkouts över alla kartor | admin |
| `/maps/:slug/view` | Kartvy "Hela kartan" med läge **Lägg bana** | reader+ |
| `/maps/:slug/courses` | Lista sparade banor (egna + publika) | reader+ |
| `/maps/:slug/courses/:id` | Redigera/visa bana; skuggbana; kontrollista; PDF-export | ägare (redigera) / reader+ (visa publik) |

> **`/pending`** — ej i v1. Reserveras för framtida självregistrering/OAuth med godkännandeflöde.

---

## 10. Tekniska val — beslutade (v0.4)

| Beslut | Val | Motivering |
|--------|-----|------------|
| Frontend + backend | **Next.js 15** (App Router) | Fullstack, bra Auth.js-stöd, snabb MVP |
| Auth | **Auth.js v5** + **Credentials**-provider, **bcrypt**, **JWT**-sessioner | Admin-skapade konton; inget OAuth i MVP |
| Databas | **PostgreSQL** via **Prisma** (Neon/Supabase) | Relationer, migrationer |
| Fillagring | **Cloudflare R2** (S3-kompatibel) | Billig lagring, presigned uploads |
| Hosting | **Vercel** | Enkel deploy; filer går direkt till R2 |
| Uppladdning | **Presigned upload klient → R2** | Undviker Vercels 4.5 MB body-limit |
| OCD-parsning | **`ocad2geojson`** (npm) | Parsar .ocd → GeoJSON + SVG |
| Diff-motor | Egen modul ovanpå parsad data | Matchar objekt, klassificerar added/removed/modified |
| Bakgrundsjobb | **Vercel Cron** eller **Inngest/Trigger.dev** | Parsning + diff utanför request (21 MB fil) |
| Domän | **kartor.ifkmora.se** | DNS → Vercel |
| Initial admin | **`buud212@gmail.com`** | Seed/bootstrap i prod |
| Google OAuth | **Pausad / uppskjuten** | Kan återinföras efter MVP (självregistrering) |

---

## 11. OCAD-specifika överväganden

- **Filformat:** `.ocd` — binärt, magic bytes `AD 0C`. Exempelfil är OCAD 12 (`ocad12` i filnamn).
- **Storlek:** Exempelfil ~21 MB — planera för filer upp till 100 MB.
- **Parsning:** `ocad2geojson` stöder OCAD 10, 11, 12. Vissa avancerade symboler (t.ex. hatch fills) kan saknas i export — diff ska markera parse-varningar.
- **Diff-algoritm (förslag):**
  1. Parsa version A och B → normaliserad objektlista (symbolNr, typ, centroid, geometri-hash, text)
  2. Matcha objekt med spatial tolerans (~1 m i kartkoordinater) + samma symbol
  3. Omatchade i B → **tillagda**; omatchade i A → **borttagna**; matchade med olika geometri/text → **ändrade**
  4. Generera SVG-preview per version; overlay med grön/röd/gul markering
- **Prestanda:** Parsning av 21 MB tar ~10–30 s — körs asynkront, inte i HTTP-request.
- **Begränsningar:** Diff speglar vad parsern ser, inte nödvändigtvis 100 % av OCADs interna objekt. Vid parse-fel: visa tydligt fel + fallback till metadata-jämförelse.
- **AGPL-3.0:** Publicera källkod (t.ex. GitHub repo) om tjänsten deployas publikt.
- **Namngivning:** Systemet normaliserar filnamn internt; originalfilnamn sparas som metadata.

---

## 12. Säkerhet och compliance

- [ ] All trafik över HTTPS
- [ ] Lösenord hashade med bcrypt; aldrig lagrade eller loggade i klartext
- [ ] JWT-sessioner med säker cookie-konfiguration (`httpOnly`, `secure`, `sameSite`)
- [ ] Fillänkar är tidsbegränsade signerade URL:er (inte publikt gissningsbara)
- [ ] Rate limiting på inloggning och uppladdning
- [ ] GDPR: lagra minsta möjliga personuppgifter (e-post, namn); inga OAuth-tokens i v1
- [ ] Rutin för backup och återställning av fillagring

---

## 13. Framgångsmått (KPI:er)

| Mätetal | Mål |
|---------|-----|
| Antal förlorade/överskrivna versioner | 0 |
| Tid från uppladdning till att annan kan ladda ner | < 1 min |
| Andel användare som kan hitta senaste version utan att fråga admin | > 90% |
| Antal supportärenden om "vilken fil gäller?" | Minskning över tid |

---

## 14. Roadmap (förslag)

### Fas 1 — MVP (6–8 veckor, uppskattning)
- Inloggning med e-post/lösenord (Auth.js Credentials, bcrypt, JWT)
- Admin skapar användarkonton och tilldelar roller
- CRUD för kartfiler (logiska grupper)
- Uppladdning/nedladdning med versionshistorik
- **OCD-parsning + innehållsdiff med visuell SVG-preview**
- Grundläggande adminpanel
- Deploy på kartor.ifkmora.se

### Fas 2 — Förbättrad granskning
- "Hoppa till ändring" i kartpreview
- Markera "rekommenderad version"
- E-postnotiser vid ny uppladdning
- PDF-export av jämförelserapport

### Fas 3 — Checkout/checkin (v0.5)

- Områdesbaserad checkout (rektangel/polygon) med exklusiva lås
- Subset .ocd-export och checkin-uppladdning
- Diff och integration mot senaste head med dubbel bekräftelse (användare + admin)
- Checkout-overlay synlig för alla; admin force release
- E-postnotiser och påminnelser för inaktiva checkouts
- Varning vid full uppladdning när checkouts är aktiva

### Fas 4 — Mognad
- **Google OAuth / självregistrering** (pausad i MVP; kräver godkännandeflöde)
- Förbättrad objektmatchning (färre falska positiva)
- Avancerad audit och rapporter
- API för automatiserad backup
- (Utred) OCAD Desktop batch om parsern inte räcker

### Fas 5 — Lägg bana (v0.6)

- Overlay-redigerare i kartvyn ("Hela kartan")
- Symbolpanel 700–709; punkt, linje, yta, text
- Spara/ladda banor; privat som standard, valfritt publik
- Skuggbana för jämförelse; kontrollista med auto-numrering
- PDF-export A4/A3, liggande/stående, användarvald skala
- Alltid mot senaste head-version; påverkar aldrig `.ocd`

---

## 15. Beslut — bekräftade (2026-08-01)

| # | Fråga | Beslut |
|---|-------|--------|
| 1 | Autentisering | **Auth.js Credentials** (e-post + lösenord), bcrypt, JWT-sessioner — admin skapar konton manuellt |
| 2 | Google OAuth | **Pausad / uppskjuten** — inte i MVP; kan återinföras för självregistrering senare |
| 3 | Initial admin | **`buud212@gmail.com`** via seed/bootstrap |
| 4 | Domän | **`kartor.ifkmora.se`** |
| 5 | Jämförelse | **OCD-innehåll ska granskas** — tillagda/borttagna/ändrade objekt redovisas + SVG-preview (inte bara metadata) |
| 6 | Skala | ~5–20 kartfiler, ~5–15 användare (oförändrat antagande) |
| 7 | Hosting | Vercel + Neon + R2 (oförändrat) |
| 8 | Språk | Enbart svenska i UI v1 |
| 9 | Borttagning | Versioner permanenta i v1 |
| 10 | Notifiering | In-app badge för admin; e-post i Fas 2 |

## 16. Beslut — checkout/checkin (2026-08-02)

| # | Fråga | Beslut |
|---|-------|--------|
| 1 | Urval vid checkout | **Områdesbaserat** (rektangel/polygon) — v1 |
| 2 | Exportformat | **Subset .ocd** (inte hel karta) |
| 3 | Integrationsbas | Alltid mot **senaste version** (rebase/merge mot head) |
| 4 | Diff vid checkin | **Endast checkade objekt** |
| 5 | Bekräftelse före integration | **Både utcheckande användare och admin** måste bekräfta |
| 6 | Full uppladdning | **Tillåten** men med **varning** om aktiva checkouts |
| 7 | Lås | **Exklusiva** — inga överlappande checkouts |
| 8 | Synlighet | Checkout-område synligt för alla (vem, när) |
| 9 | Admin force release | Admin kan **avbryta/radera checkout** |
| 10 | E-post | Notis vid **alla** checkout-händelser (befintlig e-postinfrastruktur) |
| 11 | Påminnelse | Automatisk e-post efter **X dagar** (konfigurerbart) |
| 12 | Roller | Reader: se lås; Editor: egen checkout; Admin: allt + force cancel + bekräfta integration |

## 17. Beslut — Lägg bana (2026-08-02)

| # | Fråga | Beslut |
|---|-------|--------|
| 1 | Symboltyper v1 | **Alla från start:** punkt, linje, yta, text |
| 2 | Symbolpanel | **700–709** (alla i panelen) |
| 3 | Visning | **En aktiv bana** + valfri **skuggbana** (ghost) för jämförelse |
| 4 | Kartversion | Alltid mot **senaste head-version** (ej pinnad version) |
| 5 | Vem kan skapa | **Alla inloggade** inkl. Reader |
| 6 | Synlighet | **Privat som standard**; kryssruta **"Gör publik"** |
| 7 | PDF-export | **A4 och A3**, liggande och stående, **användarvald skala** |
| 8 | Kontrollista | **Ja** — auto-numrering 1–2–3 … i placeringsordning |
| 9 | Underliggande karta | **Endast overlay** — `.ocd` ändras aldrig |
| 10 | UI-placering | Symbolpanel **till höger** om kartan; läge i **"Hela kartan"** |

### Fortfarande öppet (checkout)

- [ ] **X dagar för påminnelse** — föreslagen default **7 dagar** (`CHECKOUT_REMINDER_DAYS=7`)
- [ ] Exakt algoritm för subset .ocd-generering (native OCAD vs parser-baserad rekonstruktion)
- [ ] Beteende vid objekt utanför checkat område i uppladdad subset (ignorera vs varna vs avvisa)

### Fortfarande öppet (övrigt)

- [ ] Budget tak för molntjänster
- [ ] Var källkod publiceras (AGPL-krav för ocad2geojson)
- [ ] Lösenordspolicy (minimilängd, rotation) och hur tillfälliga lösenord delas till nya användare
- [ ] Google OAuth — exakt scope och domänbegränsning när det återinförs

---

## 17. Acceptanskriterier (MVP)

- [ ] Användare kan logga in med e-post och lösenord på `/login`
- [ ] Admin kan skapa nytt användarkonto med e-post, lösenord och roll (Reader, Editor eller Admin)
- [ ] Nyskapade användare har direkt åtkomst enligt tilldelad roll — ingen väntande status
- [ ] Admin kan ändra roll för befintliga användare
- [ ] Editor kan ladda upp `.ocd` till befintlig kartfil; tidigare versioner finns kvar
- [ ] Reader kan ladda ner valfri version
- [ ] Användare kan jämföra två versioner och se tillagda, borttagna och ändrade kartobjekt
- [ ] Jämförelsevyn visar SVG-preview av båda versionerna
- [ ] `buud212@gmail.com` är admin vid första deploy
- [ ] Alla uppladdningar och nedladdningar loggas med användare och tid
- [ ] Lösenord lagras hashat (bcrypt); aldrig i klartext i databas eller loggar

### Acceptanskriterier — checkout/checkin (v0.5)

- [ ] Editor kan rita rektangel/polygon och checka ut område; subset .ocd laddas ner
- [ ] Överlappande checkout nekas med tydligt felmeddelande
- [ ] Alla inloggade ser aktiva checkout-områden med ägare och datum
- [ ] Editor kan checka in redigerad subset; diff visas endast för checkade objekt
- [ ] Integration sker mot senaste head-version efter bekräftelse av både användare och admin
- [ ] Admin kan avbryta checkout; lås frigörs och e-post skickas
- [ ] E-post skickas vid checkout skapad, checkin, integration och admin-avbrott
- [ ] Påminnelse skickas efter konfigurerat antal dagar (default 7) för inaktiv checkout
- [ ] Full uppladdning visar varning om aktiva checkouts finns
- [ ] Reader kan se lås men inte skapa checkout

### Acceptanskriterier — Lägg bana (v0.6)

- [ ] Inloggad användare (Reader+) kan öppna "Lägg bana" i kartvyn mot senaste head-version
- [ ] Symbolpanel visar symboler 700–709; punkt, linje, yta och text kan placeras
- [ ] Textsymbol öppnar modal för textinmatning
- [ ] Flytta och radera fungerar på overlay-objekt
- [ ] Bana sparas med namn; ägare kan redigera; standard privat med valfri publik
- [ ] Publika banor syns för alla på samma kartfil
- [ ] Skuggbana kan visas halvtransparent utan att påverka aktiv bana
- [ ] Kontrollista visar nummer 1–2–3 … i placeringsordning
- [ ] PDF-export med A4/A3, liggande/stående och vald skala
- [ ] Underliggande `.ocd` förblir oförändrad efter banarbete

---

## 18. Checkout/checkin — parallell redigering (v0.5)

### 18.1 Problem och motivation

När flera kartografer redigerar samma `.ocd` offline riskerar de att skriva över varandras arbete vid uppladdning. Checkout/checkin introducerar **exklusiva lås per område** så att:

- Varje redaktör arbetar mot en **subset** av kartan
- Andra ser **vem som håller på var** innan de börjar
- Ändringar **integreras kontrollerat** mot senaste version med granskning och dubbel bekräftelse

### 18.2 Flöde (sammanfattning)

```
Checkout (område + subset .ocd)
    → Redigera i OCAD Desktop
    → Checkin (ladda upp subset)
    → Diff (endast checkade objekt, mot head)
    → Användare bekräftar
    → Admin bekräftar
    → Integration → ny version, lås frigörs
```

### 18.3 Funktionella krav

Se **§6.7** (`CHECKOUT-1` … `CHECKOUT-16`).

### 18.4 Datamodell

Se **§8** (`MapCheckout`). Statusflöde:

```
active → checkin_pending → user_confirmed → integrated
   │            │                │
   └────────────┴────────────────┴──→ cancelled (admin force release)
```

### 18.5 Kantfall och beteende

| Scenario | Beteende v1 |
|----------|-------------|
| **Överlappande checkout** | Neka ny checkout om område/objekt överlappar aktiv checkout (spatial intersect + delade objectIds) |
| **Föråldrad basversion** | Vid checkin integreras alltid mot **aktuell head**; diff visar om head ändrats sedan checkout |
| **Head ändrad under checkout** | Rebase: checkout-objekt matchas mot ny head; konflikter (samma objekt ändrat av annan) flaggas i diff-granskning |
| **Full uppladdning med aktiva checkouts** | Tillåten med **varning** som listar berörda checkouts; admin bör koordinera |
| **Objektidentitet** | Matchning via symbol + spatial tolerans (~2 m) + geometri-hash; objekt utanför checkat område i subset ignoreras eller varnas (öppet beslut) |
| **Parse-fel i subset** | Checkin avvisas med tydligt fel; checkout förblir aktiv tills avbruten eller lyckad checkin |
| **Dubbel checkin** | Endast en checkin per aktiv checkout; ny checkin ersätter tidigare pending om ej integrerad |
| **Admin avbryter** | Status `cancelled`; subset-filer kan behållas för audit; e-post till checkout-ägare |
| **Inaktiv checkout** | Cron-jobb skickar påminnelse efter X dagar (default 7); upprepas enligt konfiguration |

### 18.6 Icke-mål (checkout v1)

- Objektbaserat urval (klicka enskilda objekt) — endast område v1
- Automatisk integration utan mänsklig bekräftelse
- Realtidssynk med OCAD Desktop (checkout är filbaserat)
- Merge av flera parallella checkouts i ett steg
- Pixel-perfekt subset .ocd identisk med manuell export i OCAD Desktop

### 18.7 Öppna beslut

| Beslut | Förslag |
|--------|---------|
| Påminnelsedagar (X) | **7 dagar** (`CHECKOUT_REMINDER_DAYS=7`) |
| Subset utanför område i checkin | **Varna** och exkludera från integration |
| Upprepad påminnelse | En påminnelse; ev. veckovis upprepning i v1.1 |

---

## 19. Ordlista

| Term | Betydelse |
|------|-----------|
| **OCAD** | Programvara för orienteringskartor; `.ocd` är det nativa filformatet |
| **ISOM 2017** | International Specification for Orienteering Maps (2017) |
| **Version** | En specifik uppladdad filinstans i historiken |
| **Kartfil (logisk)** | En named entity, t.ex. "Mora Väst med Venjan", med många versioner |
| **Checkout** | Reservering av ett kartområde för exklusiv redigering; genererar subset .ocd |
| **Checkin** | Uppladdning av redigerad subset efter offline-arbete |
| **Subset .ocd** | OCAD-fil som innehåller endast objekt inom checkat område |
| **Head / senaste version** | Aktuell senaste MapVersion för en kartfil; integrationsmål vid checkin |
| **Force release** | Admin avbryter checkout utan integration |
| **Bana (Course)** | Sparat overlay-lager med ban-symboler ovanpå en kartfil |
| **Skuggbana** | Sekundär bana visas halvtransparent för jämförelse (read-only) |
| **Kontrollista** | Numrerad lista över kontroller i placeringsordning (1, 2, 3 …) |
| **Lägg bana** | Webbläge för att placera ban-symboler 700–709 som overlay |

---

## 20. Lägg bana — banoverlay-redigerare (v0.6)

### 20.1 Problem och motivation

Tävlingsledare och banläggare behöver planera orienteringsbanor ovanpå den senaste kartan utan att öppna OCAD Desktop eller riskera att ändra kartfilen. Idag sker banplanering ofta ad hoc (papir, separata OCAD-filer, skärmdumpar). **Lägg bana** ger ett webblaserbart overlay-lager med ISOM-symboler 700–709 direkt ovanpå "Hela kartan".

### 20.2 Flöde (sammanfattning)

```
Öppna kartvy (head) → Lägg bana → Välj symbol 700–709
    → Placera/rita objekt (punkt/linje/yta/text)
    → Flytta/radera vid behov
    → (Valfritt) visa skuggbana
    → Spara med namn (privat/publik)
    → Kontrollista + PDF-export
```

### 20.3 Funktionella krav

Se **§6.8** (`COURSE-1` … `COURSE-17`).

### 20.4 Datamodell

Se **§8** (`Course`, `CourseObject`).

| Fält | Syfte |
|------|--------|
| `Course.isPublic` | `false` = endast ägare; `true` = alla reader+ på kartfilen |
| `CourseObject.sortOrder` | Placeringsordning för kontrollista och auto-numrering |
| `CourseObject.symbolNr` | 700–709 enligt ISOM ban-symboler |

### 20.5 Symboler 700–709 (referens)

| Symbol | Typisk användning | Geometrityp |
|--------|-------------------|-------------|
| 700 | (Reserverad/övrig) | Punkt/linje/yta/text enligt symboldef |
| 701 | Start | Punkt |
| 702 | Kontroll | Punkt |
| 703 | Mål | Punkt |
| 704–709 | Övriga ban-symboler (markering, passagemål, …) | Varierar |

> Exakt utseende approximeras i webben; full OCAD-symbolgrafik kräver inte parser-export i v1.

### 20.6 Kantfall och beteende

| Scenario | Beteende v1 |
|----------|-------------|
| **Ny head-version efter sparad bana** | Bana visas mot **aktuell head**; overlay-koordinater oförändrade (kart-CRS) |
| **Head ändrats geometriskt** | Overlay kan visuellt "glida" om kartan flyttats kraftigt — användare får varning vid större avvikelse (Should) |
| **Privat bana** | Endast ägare ser i lista; andra får 404 vid direktlänk |
| **Publik bana** | Alla reader+ ser och kan öppna read-only; endast ägare redigerar |
| **Skuggbana** | Valfri annan sparad bana (egen eller publik); halvtransparent; ej redigerbar |
| **Kontrollista** | Endast objekt med kontroll-relevant symbol (t.ex. 702) numreras 1, 2, 3 … efter `sortOrder` |
| **Tom bana** | Sparas tillåtet; PDF med tom overlay eller prompt |
| **Radera bana** | Endast ägare eller admin; auditlogg |
| **Symbol utanför kartextent** | Tillåtet spara; kan klippas i PDF-preview |

### 20.7 Icke-mål (Lägg bana v1)

- Skriva overlay tillbaka till `.ocd` eller skapa ny MapVersion
- Importera befintlig bana från OCAD-fil
- Flera samtidigt redigerbara banor i samma vy (en aktiv + en skuggbana)
- Realtidssamarbete / samtidig redigering av samma bana
- Automatisk kontrollplacering eller optimal lösningsvalidering
- Pixel-perfekt symbolrendering identisk med OCAD Desktop

### 20.8 Risker

| Risk | Sannolikhet | Konsekvens | Åtgärd |
|------|-------------|------------|--------|
| OCAD-symbolutseende approximeras | Hög | Banor ser annorlunda ut än i OCAD | Dokumentera begränsning; iterera symbol-SVG i senare version |
| PDF-skala och utskriftsarea | Medel | Fel skala på utskrift | Återanvänd befintlig kart-PDF-motor; enhetstester för skala |
| Scope (alla geometrityper + PDF) | Medel | Försenad leverans | Fasad implementation (E10A–F) |
| Head-ändring vs overlay | Låg–Medel | Visuell felmatch | Visa head-versionsdatum; ev. varning |

### 20.9 Öppna beslut

| Beslut | Förslag |
|--------|---------|
| Vilka symbolnummer räknas som "kontroll" i listan | **702** (+ ev. 704–709 efter behov) |
| Min/max PDF-skala | **1:4000 – 1:20000** (konfigurerbart) |
| Max antal objekt per bana | **500** (soft limit med varning) |

---

## Bilaga: Relaterade filer i repo

```
Kartfiler/
├── prd.md
├── docs/
│   └── mvp-tickets.md
├── web/                            ← Next.js-app (PoC igång)
│   ├── src/lib/ocad/               ← OCAD-parsning
│   └── scripts/poc-parse-ocd.mts   ← CLI PoC
└── Exempelfil/
    └── ORIGINAL_Mora_Väst_med_Venjan_ISOM2017-6-2_20260227_ocad12.ocd
```

---

*Nästa steg: Lägg bana enligt §20 och [docs/mvp-tickets.md](docs/mvp-tickets.md) E10.*
