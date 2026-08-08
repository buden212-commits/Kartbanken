# Systemspecifikation — kartor.ifkmora.se

> **Version:** 2026-08-08  
> **Produkt:** Webbapp för versionshantering och granskning av OCAD-orienteringskartor  
> **Domän:** kartor.ifkmora.se  
> **Kodbas:** `web/` (Next.js)  
> **Relaterade dokument:** [THIRD_PARTY_NOTICES.md](../web/THIRD_PARTY_NOTICES.md), [prd.md](../prd.md), [web/README.md](../web/README.md)

Detta dokument beskriver **komponenter**, **beroenden**, **licenser** och **tillgänglighet (WCAG)**. Det är en teknisk översikt — inte juridisk rådgivning.

---

## 1. Systemöversikt

Webbapplikation för IFK Mora OK som hanterar:

- Kartområden och **versionshistorik** för `.ocd`-filer
- **Jämförelse** (objekts-diff) mellan versioner
- **Checkout/checkin** av kartutsnitt för parallell redigering i OCAD Desktop
- **Kartförslag** (markeringar, GPS-spår)
- **Banor** som overlay ovanpå karta (symboler 700–709)
- **Export** (PDF, GeoTIFF, OCD)
- **Admin** (användare, SMTP, lagring, auditlogg)

### 1.1 Arkitektur

```
┌─────────────┐     HTTPS      ┌──────────────────────────────────┐
│  Webbläsare │ ◄────────────► │  Vercel (Next.js 16 App Router)  │
│  React 19   │                │  Route Handlers + Server Components│
└─────────────┘                └───────────┬──────────────────────┘
                                           │
                    ┌──────────────────────┼──────────────────────┐
                    ▼                      ▼                      ▼
            ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
            │ Neon         │      │ Vercel Blob  │      │ Gmail SMTP   │
            │ PostgreSQL   │      │ (.ocd, bilagor)│     │ (notiser)    │
            └──────────────┘      └──────────────┘      └──────────────┘
```

| Lager | Teknik |
|--------|--------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4, TypeScript 5 |
| Backend | Next.js Route Handlers (serverless) |
| Auth | Auth.js / NextAuth v5 (Credentials), bcryptjs |
| ORM | Prisma 5 → PostgreSQL |
| Fillagring | Vercel Blob (prod), lokalt filsystem (dev) |
| Drift | Vercel + Neon |
| Typsnitt | Geist / Geist Mono (`next/font`) |

---

## 2. Applikationskomponenter

### 2.1 Sidor (`web/src/app/`)

| Modul | URL | Beskrivning |
|--------|-----|-------------|
| Start | `/` | Kartområden, skapa område, dagligt tips |
| Auth | `/login`, `/register`, `/byt-losenord`, `/pending` | Inloggning, registrering, lösenord |
| Område | `/maps/[slug]` | Versionshistorik, uppladdning, checkout, förslag |
| Kartvy | `/maps/.../versions/[id]/viewer` | Fullskärm, lager, export, GPS-position |
| Jämförelse | `/maps/.../compare` | Diff mellan två versioner |
| Checkout | `/maps/.../checkout`, `.../checkout/[id]` | Utcheckning, diff, incheckning |
| Kartförslag | `/maps/.../suggest`, `/suggestions/[id]` | Föreslå ändringar, GPS-spår |
| Bana | `/maps/.../bana` | Banoverlay-redigerare |
| Verifiera | `/verifiera` | Tillfällig jämförelse utan uppladdning |
| Hjälp | `/hjalp` | Guide, processdiagram, release notes |
| Admin | `/admin/users`, `/admin/settings`, `/admin/lagring`, `/admin/loggning` | Administration |

### 2.2 UI-komponenter (`web/src/components/`)

| Grupp | Komponenter | Ansvar |
|--------|-------------|--------|
| **Layout** | `app-header`, `app-header-user-menu` | Navigation, profilmeny |
| **Karta** | `diff-map-panel`, `fullscreen-map-viewer`, `map-layer-panel`, `map-export-controls` | SVG-karta, zoom/pan, lager, export, GPS |
| **Versioner** | `version-history-list`, `version-publish-toggle`, `upload-version-form`, `version-history-actions` | Historik, publicering, åtgärder |
| **Checkout** | `checkout-detail-client`, `checkout-overview-map`, `checkout-list-panel`, `checkout-page-client` | Utcheckning och integration |
| **Kartförslag** | `suggestion-create-client`, `suggestion-detail-client`, `suggestion-list-panel` | Markering, GPS-spår, granskning |
| **Bana** | `course-editor-client`, `course-pdf-panel`, `course-control-list` | Banor och PDF |
| **Admin** | `admin-user-edit-form`, `admin-storage-dashboard`, `admin-audit-log-panel`, `smtp-settings-form` | Användare, lagring, logg, e-post |
| **Auth** | `login-form`, `register-form`, `change-password-form`, `forgot-password-form` | Autentisering |
| **Hjälp** | `help-page-content`, `help-process-diagram`, `help-link-icon`, `help-release-notes` | Dokumentation |

### 2.3 Affärslogik (`web/src/lib/`)

| Modul | Innehåll |
|--------|----------|
| `lib/ocad/` | OCAD-läsning, SVG, diff, export (PDF/GeoTIFF/OCD), CRS, kartskala |
| `lib/checkout/` | Checkout, integration, overlap, subset-export |
| `lib/suggestion/` | Kartförslag, GPS-spår, geometri, PDF-rapport |
| `lib/course/` | Banor, symboler, validering, PDF-skala |
| `lib/auth/` | Roller (Reader/Editor/Admin), lösenord, API-behörighet |
| `lib/storage/` | Vercel Blob / lokal lagring |
| `lib/maps/` | Versionssökning, publicering, borttagning |
| `lib/help/` | Hjälpavsnitt, release notes, feature tips |
| `lib/settings/` | App-inställningar, krypterad SMTP |
| `lib/email.ts` | E-postmallar och utskick |

### 2.4 API (`web/src/app/api/`)

REST-liknande endpoints för:

- `maps`, `versions`, `checkouts`, `compare`, `courses`, `suggestions`
- `export` (PDF, GeoTIFF, OCD), `preview`, `blob/upload`
- `verify/compare` (tillfällig jämförelse)
- `admin/settings`, `auth/*`, `cron/checkout-reminders`

### 2.5 Datamodell (Prisma)

Huvudentiteter: `User`, `MapFile`, `MapVersion`, `MapCheckout`, `Course`, `MapSuggestion`, `AuditLog`, `AppSettings`.

Schema: `web/prisma/schema.prisma`

### 2.6 Roller

| Roll | Behörighet |
|------|------------|
| **Reader** | Ladda ner, se checkout, lägga bana, kartförslag |
| **Editor** | Reader + ladda upp, checkout, publicering |
| **Admin** | Editor + användare, inställningar, avbryta checkout |

---

## 3. NPM-beroenden (direkta)

| Paket | Version | Syfte | Licens |
|--------|---------|-------|--------|
| next | 16.2.12 | App-ramverk | MIT |
| react / react-dom | 19.2.4 | UI | MIT |
| next-auth | 5.0.0-beta.32 | Autentisering | ISC |
| @auth/prisma-adapter | 2.11.3 | Auth ↔ databas | ISC |
| @prisma/client / prisma | 5.22.0 | ORM | Apache-2.0 |
| @vercel/blob | 2.6.1 | Fillagring | Apache-2.0 |
| bcryptjs | 3.0.3 | Lösenordshashing | MIT |
| **ocad2geojson** | 2.1.23 | **OCAD-parsing (kärna)** | **AGPL-3.0-or-later** |
| proj4 | 2.21.0 | Koordinattransformation | MIT |
| sharp | 0.35.3 | Server-side bild/PDF | Apache-2.0 (+ LGPL binaries) |
| geotiff | 3.0.5 | GeoTIFF-export | MIT |
| jspdf | 4.2.1 | PDF-export (klient) | MIT |
| mermaid | 11.16.1 | Processdiagram i hjälp | MIT |
| nodemailer | 8.0.11 | E-post | MIT-0 |

**Produktionsträd:** ~255 npm-paket totalt. Full lista: [web/THIRD_PARTY_NOTICES.md](../web/THIRD_PARTY_NOTICES.md) och [third-party-licenses.csv](./third-party-licenses.csv).

---

## 4. Licenser och distribution

### 4.1 Applikationens egen kod

- `web/package.json` har `"private": true`
- Ingen publicerad open source-licens för IFK Mora-appen
- Upphovsrätt: IFK Mora OK / projektägaren

### 4.2 Kritisk: ocad2geojson (AGPL-3.0-or-later)

Används server-side i bl.a.:

- `lib/ocad/read.ts`, `lib/ocad/svg.ts`, `lib/ocad/diff-layers.ts`
- `lib/ocad/ocad-integrate.ts`, `lib/ocad/ocad-export-server.ts`
- API-routes för preview, export och diff

**Konsekvens:** Vid distribution eller SaaS kan AGPL kräva källkodstillgång. **Utred med jurist** eller förhandla kommersiell licens med [upphovsmannen](https://github.com/perliedman/ocad2geojson).

### 4.3 Övriga särskilda licenser

| Paket | Licens | Risk |
|--------|--------|------|
| sharp (native) | Apache-2.0 + LGPL-3.0 | Låg–medel vid vidaredistribution av binaries |
| dompurify | MPL-2.0 OR Apache-2.0 | Låg (Apache-spår) |
| caniuse-lite | CC-BY-4.0 | Låg (build-time) |

### 4.4 Extern infrastruktur

| Tjänst | Avtal |
|--------|-------|
| Vercel | Kommersiellt / ToS |
| Neon PostgreSQL | Kommersiellt / ToS |
| Vercel Blob | Vercel ToS |
| Gmail SMTP | Google ToS |
| IFK Mora-logotyp | Organisationens immateriella rättigheter |

### 4.5 Underhåll av licensdokumentation

```bash
cd web
npx tsx scripts/generate-third-party-notices.mts
```

Uppdatera efter större `npm install` / dependency-uppgraderingar.

---

## 5. Tillgänglighet (WCAG 2.2 nivå AA)

**Slutsats: Systemet uppfyller inte fullt WCAG 2.2 AA.** Grundläggande mönster finns, men kartfunktionerna och avsaknad av formell audit innebär väsentliga luckor.

### 5.1 Bedömning — tio centrala kriterier

| # | WCAG 2.2 AA | Kriterium | Status | Kommentar |
|---|-------------|-----------|--------|-----------|
| 1 | 1.1.1 | Icke-textuellt innehåll | Delvis | `alt` på logotyp och bilagor; **kart-SVG/GPS saknar textalternativ** |
| 2 | 1.3.1 | Info och relationer | Delvis | Tabellrubriker, vissa dialoger; **kartlager/ritverktyg svagt semantiserade** |
| 3 | 1.4.3 | Kontrast (minimum) | Ej verifierat | Rimlig grundpalett; **ingen systematisk kontrastmätning** |
| 4 | 2.1.1 | Tangentbord | Delvis | Formulär OK; **kartpanorering, ritning, pinch-zoom begränsat** |
| 5 | 2.4.1 | Hoppa förbi block | Nej | **Ingen skip-länk** till huvudinnehåll |
| 6 | 2.4.2 | Sidtitel | Ja | `metadata.title`, sidrubriker |
| 7 | 3.3.1 | Felidentifiering | Ja | Felmeddelanden i formulär |
| 8 | 3.3.2 | Etiketter | Ja | `.form-label`, `htmlFor` på de flesta fält |
| 9 | 4.1.2 | Namn, roll, värde | Delvis | `aria-label` på många knappar; **inte alla interaktiva element** |
| 10 | 4.1.3 | Statusmeddelanden | Delvis | Begränsat `aria-live`; GPS-status som vanlig text |

### 5.2 Det som fungerar

- `lang="sv"` på `<html>`
- Formulär med etiketter och fokusring
- `aria-label`, `aria-expanded`, `aria-modal` på flera komponenter
- Tangentbordsstöd för klickbara tabellrader (versionshistorik)
- Hjälpikoner med beskrivande `aria-label`

### 5.3 Prioriterade förbättringar

1. Skip-länk till `<main>`
2. Tangentbordsalternativ för kartverktyg (eller tydlig dokumentation om begränsning)
3. `aria-live` för GPS-spårning och dynamiska statusmeddelanden
4. Kontrastaudit (automatiskt + manuellt)
5. Textbeskrivning/alternativ för kartdiagram (Mermaid) och diff-färger

---

## 6. Säkerhet (kort)

| Område | Implementation |
|--------|----------------|
| Autentisering | Auth.js session, bcrypt-lösenord |
| Auktorisering | Rollbaserad (`lib/auth/permissions.ts`), middleware |
| Fillagring | Autentiserade API-routes, blob-tokens |
| SMTP-lösenord | Krypterat i databas (`AUTH_SECRET`) |
| Audit | `AuditLog` för spårbarhet |

---

## 7. Referenser

- [web/README.md](../web/README.md) — lokal utveckling och deploy
- [web/THIRD_PARTY_NOTICES.md](../web/THIRD_PARTY_NOTICES.md) — fullständig licenslista
- [prd.md](../prd.md) — produktkrav
- [docs/kartforslag-spec.md](./kartforslag-spec.md) — kartförslag

---

*Senast uppdaterad: 2026-08-08*
