# PRD: OCAD-kartfilshanterare

> **Status:** v0.4 — autentisering uppdaterad (Credentials, ej Google i MVP)  
> **Senast uppdaterad:** 2026-08-01  
> **Domän:** kartor.ifkmora.se  
> **Implementation:** [docs/mvp-tickets.md](docs/mvp-tickets.md)  
> **Exempelfil:** `Exempelfil/ORIGINAL_Mora_Väst_med_Venjan_ISOM2017-6-2_20260227_ocad12.ocd`

---

## 1. Sammanfattning

Vi behöver ett webbaserat verktyg för att hantera OCAD-kartfiler (`.ocd`) som flera personer justerar parallellt. Verktyget ska:

- Bevara **alla historiska versioner** när nya filer laddas upp
- Möjliggöra **jämförelse** mellan versioner för att granska ändringar
- Kräva **inloggning med e-post och lösenord** för att identifiera vem som gjort vad
- Låta en **administratör skapa användarkonton manuellt** och tilldela rättighetsnivå (Reader, Editor, Admin) vid skapande

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

**Exempel från verkligheten:**  
Filnamn som `ORIGINAL_Mora_Väst_med_Venjan_ISOM2017-6-2_20260227_ocad12.ocd` visar att version, datum och OCAD-version redan kodas manuellt i filnamnet — ett tecken på att vi saknar ett dedikerat versionshanteringssystem.

---

## 3. Mål och icke-mål

### Mål (v1)

- [ ] Central plats för alla kartfiler och deras versioner
- [ ] Säker inloggning med e-post och lösenord (Auth.js Credentials, bcrypt)
- [ ] Admin skapar användarkonton manuellt och tilldelar rättighetsnivå vid skapande
- [ ] Uppladdning skapar ny version utan att radera tidigare
- [ ] Nedladdning av valfri version
- [ ] **Innehållsjämförelse** av `.ocd`-filer — redovisa tillagda, borttagna och ändrade kartobjekt
- [ ] Visuell kartpreview i jämförelsevyn (SVG)
- [ ] Auditlogg: vem laddade upp/laddade ner vad och när

### Icke-mål (v1)

- Redigera OCAD-filer direkt i webbläsaren
- Ersätta OCAD Desktop som kartredigeringsverktyg
- Automatisk merge/konfliktlösning mellan parallella redigeringar
- Pixel-perfekt diff identisk med OCAD Desktop (vår diff baseras på parser, inte OCAD-motorn)
- Redigera OCAD-filer i webbläsaren

---

## 4. Användare och roller

| Roll | Beskrivning | Typiska behov |
|------|-------------|---------------|
| **Läsare (Reader)** | Nedladdning | Hämta senaste eller historisk version |
| **Redaktör (Editor)** | Uppladdning + nedladdning | Ladda upp ny version efter fältarbete |
| **Administratör (Admin)** | Full kontroll | Skapa användarkonton, hantera rättigheter, ev. radera versioner |

> **Framtid (ej MVP):** Rollen *Gäst / väntande* kan införas vid självregistrering eller Google OAuth — då krävs godkännande innan åtkomst. I v1 skapar admin konton direkt med tilldelad roll.

### Personas (exempel)

1. **Kartansvarig (Admin)** — koordinerar vem som får ladda upp, granskar ändringar före "officiell" version markeras.
2. **Fältkartograf (Editor)** — varit ute i terrängen, gjort justeringar i OCAD Desktop, laddar upp ny `.ocd`.
3. **Tävlingsledare (Reader)** — behöver senaste godkända kartan inför arrangemang, laddar bara ner.

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
```

---

## 9. UI — sidor (förslag v1)

| Sida | Beskrivning | Åtkomst |
|------|-------------|---------|
| `/` | Dashboard: lista kartfiler, senaste aktivitet | Inloggad |
| `/login` | Inloggning med e-post och lösenord | Alla |
| `/maps/:slug` | Detalj: versionshistorik, ladda ner, jämför, ladda upp | reader+ |
| `/maps/:slug/compare?v1=&v2=` | Jämförelsevy: sammanfattning, objektlista, SVG-preview | reader+ |
| `/admin/users` | Skapa och hantera användarkonton | admin |
| `/admin/audit` | Auditlogg | admin |

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

### Fas 3 — Mognad
- **Google OAuth / självregistrering** (pausad i MVP; kräver godkännandeflöde)
- Förbättrad objektmatchning (färre falska positiva)
- Avancerad audit och rapporter
- API för automatiserad backup
- (Utred) OCAD Desktop batch om parsern inte räcker

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

### Fortfarande öppet

- [ ] Budget tak för molntjänster
- [ ] Var källkod publiceras (AGPL-krav för ocad2geojson)
- [ ] Lösenordspolicy (minimilängd, rotation) och hur tillfälliga lösenord delas till nya användare
- [ ] Google OAuth — exakt scope och domänbegränsning när det återinförs

---

## 16. Acceptanskriterier (MVP)

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

---

## 17. Ordlista

| Term | Betydelse |
|------|-----------|
| **OCAD** | Programvara för orienteringskartor; `.ocd` är det nativa filformatet |
| **ISOM 2017** | International Specification for Orienteering Maps (2017) |
| **Version** | En specifik uppladdad filinstans i historiken |
| **Kartfil (logisk)** | En named entity, t.ex. "Mora Väst med Venjan", med många versioner |

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

*Nästa steg: starta implementation (T0.1 + T4.1 PoC mot exempelfilen).*
