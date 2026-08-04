# MVP — Implementationstickets

> **Kopplad till:** [prd.md](../prd.md) v0.6  
> **Fas:** 1 — MVP · **Fas 2 — Checkout/checkin (E9)** · **Fas 3 — Lägg bana (E10)**  
> **Uppskattad tid:** 6–8 veckor (1 utvecklare; OCD-diff ökar scope)  
> **Stack:** Next.js 15 · Auth.js · PostgreSQL · Cloudflare R2 · ocad2geojson · Vercel  
> **Domän:** kartor.ifkmora.se · **Admin:** buud212@gmail.com

---

## Översikt epics

| Epic | Tickets | Uppskattning | Beroenden |
|------|---------|--------------|-----------|
| E0 Projektsetup | 5 | 2–3 dagar | — |
| E1 Auth & RBAC | 5 | 4–5 dagar | E0 |
| E2 Fillagring | 4 | 3–4 dagar | E0 |
| E3 Kartfiler & versioner | 8 | 5–7 dagar | E1, E2 |
| **E4 OCD-parsning & diff** | **10** | **8–12 dagar** | E2, E3 |
| E5 Adminpanel | 5 | 3–4 dagar | E1, E3 |
| E6 Auditlogg | 3 | 2 dagar | E1, E3 |
| E7 UI & polish | 5 | 3–4 dagar | E3, E4, E5 |
| E8 Deploy & drift | 5 | 2–3 dagar | Alla |
| **E9 Checkout/checkin** | **18** | **12–16 dagar** | E3, E4, E6 |
| **E10 Lägg bana** | **19** | **14–18 dagar** | E3, E4, E7 |

**Totalt:** ~87 tickets · ~58–76 arbetsdagar (MVP + checkout + Lägg bana)

---

## E0 — Projektsetup

### T0.1 Initiera Next.js-projekt
**Prioritet:** Must · **Est:** 2h

- [ ] `create-next-app` med App Router, TypeScript, Tailwind, ESLint
- [ ] Mappstruktur: `app/`, `components/`, `lib/`, `prisma/`
- [ ] `.env.example` med alla variabler dokumenterade
- [ ] README med lokal setup

**Acceptans:** `npm run dev` startar utan fel.

---

### T0.2 Konfigurera PostgreSQL + Prisma
**Prioritet:** Must · **Est:** 3h · **Beror på:** T0.1

- [ ] Prisma init, schema enligt PRD §8
- [ ] Modeller: `User`, `MapFile`, `MapVersion`, `VersionDiff`, `AuditLog`
- [ ] `MapVersion`: parseStatus, objectCount, previewSvgPath, contentHash
- [ ] `VersionDiff`: summaryJson, changesJson, status
- [ ] Enum `Role`: `READER`, `EDITOR`, `ADMIN` *(reservera `PENDING` i schema om framtida OAuth/självregistrering)*
- [ ] `User`: `email`, `name`, `passwordHash`, `createdBy`, `isActive`
- [ ] Migration + seed-script (tom databas)

**Acceptans:** `npx prisma migrate dev` fungerar; tabeller skapade.

---

### T0.3 Konfigurera Cloudflare R2
**Prioritet:** Must · **Est:** 3h · **Beror på:** T0.1

- [ ] R2 bucket skapad (dev + prod)
- [ ] S3-kompatibel klient i `lib/storage.ts`
- [ ] Hjälpfunktioner: `uploadFile`, `getSignedDownloadUrl`, `deleteFile`
- [ ] Lokal dev: MinIO eller R2 dev-bucket

**Acceptans:** Testuppladdning och signerad nedladdnings-URL fungerar.

---

### T0.4 Bas-layout och design tokens
**Prioritet:** Should · **Est:** 4h · **Beror på:** T0.1

- [ ] Root layout med header (logo, användarmeny)
- [ ] Svenska texter i UI-komponenter
- [ ] Enkel färgpalett / typografi (Tailwind)
- [ ] Responsiv container

**Acceptans:** Alla sidor delar gemensam layout.

---

### T0.5 CI-grund (lint + typecheck)
**Prioritet:** Should · **Est:** 2h · **Beror på:** T0.1

- [ ] GitHub Actions: `lint`, `tsc --noEmit`, `prisma validate`
- [ ] (Valfritt) PR-check

**Acceptans:** Pipeline grön på main.

---

## E1 — Auth & RBAC

### T1.1 Credentials-auth via Auth.js
**Prioritet:** Must · **Est:** 5h · **Beror på:** T0.1, T0.2

- [ ] Auth.js v5 konfigurerad med **Credentials**-provider (e-post + lösenord)
- [ ] `AUTH_SECRET` i miljövariabler
- [ ] Lösenordsverifiering med **bcrypt** mot `User.passwordHash`
- [ ] **JWT**-sessioner (`session: { strategy: "jwt" }`)
- [ ] Session callback med `userId` och `role`
- [ ] `/login`-sida med formulär: e-post + lösenord

**Acceptans:** Inloggning skapar JWT-session; utloggning fungerar (AUTH-1, AUTH-3, AUTH-4).

---

### T1.2 Seed admin + admin skapar användare
**Prioritet:** Must · **Est:** 4h · **Beror på:** T1.1

- [ ] Seed-script: skapa **`buud212@gmail.com`** som `ADMIN` med lösenord från `INITIAL_ADMIN_PASSWORD` (RBAC-3)
- [ ] `POST /api/admin/users` — admin only: e-post, lösenord, namn, roll (`READER` | `EDITOR` | `ADMIN`)
- [ ] Hasha lösenord med bcrypt vid skapande (AUTH-2, AUTH-5, AUTH-6)
- [ ] Spara `createdBy` (admin userId)

**Acceptans:** buud212@gmail.com kan logga in som ADMIN; admin kan skapa Reader/Editor-konton med direkt åtkomst.

---

### T1.3 Middleware för route-skydd
**Prioritet:** Must · **Est:** 4h · **Beror på:** T1.2

- [ ] `middleware.ts` kontrollerar JWT-session
- [ ] Oinloggade → `/login`
- [ ] `/admin/*` kräver `ADMIN`
- [ ] Inaktiva konton (`isActive: false`) nekas åtkomst

**Acceptans:** Roller dirigeras korrekt; oinloggade blockeras (AUTH-3).

---

### T1.4 RBAC-hjälpfunktioner
**Prioritet:** Must · **Est:** 2h · **Beror på:** T1.3

- [ ] `lib/auth/permissions.ts`: `canUpload`, `canDownload`, `canAdmin`
- [ ] Server-side checks i alla API routes
- [ ] Typning av session med role

**Acceptans:** Editor kan upload; Reader nekas upload (RBAC-4, RBAC-5).

---

### T1.5 `/pending`-sida — **Uppskjuten**

> Ej i MVP. Reserveras för framtida självregistrering / Google OAuth med godkännandeflöde (PRD §4, §9).

---

### T1.6 Google OAuth — **Uppskjuten**

> Google OAuth pausad enligt PRD §10 och §15. Kan återinföras som extra Auth.js-provider efter MVP.

---

## E2 — Fillagring

### T2.1 Uppladdnings-API (presigned POST eller server upload)
**Prioritet:** Must · **Est:** 4h · **Beror på:** T0.3, T1.4

- [ ] `POST /api/upload` — validera `.ocd`-ändelse, max 100 MB (FILE-1, FILE-5)
- [ ] Stream till R2 med unikt `storagePath`: `maps/{mapFileId}/v{versionNumber}/{uuid}.ocd`
- [ ] Returnera metadata till klient

**Acceptans:** 21 MB testfil laddas upp utan timeout.

---

### T2.2 Nedladdnings-API med signerade URL:er
**Prioritet:** Must · **Est:** 3h · **Beror på:** T2.1, T1.4

- [ ] `GET /api/maps/[slug]/versions/[id]/download`
- [ ] Kontroll: användare har download-rättighet
- [ ] Redirect till R2 signed URL (TTL 15 min)
- [ ] `Content-Disposition` med originalfilnamn

**Acceptans:** URL fungerar en gång; gäst kan inte gissa path.

---

### T2.3 Fillagrings-validering och felhantering
**Prioritet:** Must · **Est:** 2h · **Beror på:** T2.1

- [ ] Avvisa fel filtyp, för stor fil
- [ ] Svenska felmeddelanden
- [ ] Rollback: radera R2-objekt om DB-transaktion misslyckas

**Acceptans:** Ogiltig fil ger tydligt fel; ingen orphan i R2.

---

### T2.4 (Should) Uppladdningsprogress i UI
**Prioritet:** Should · **Est:** 3h · **Beror på:** T2.1

- [ ] Progressbar vid upload
- [ ] Disable submit under pågående upload

**Acceptans:** Användare ser framsteg vid stor fil.

---

## E3 — Kartfiler & versioner

### T3.1 API: Skapa logisk kartfil (admin)
**Prioritet:** Must · **Est:** 3h · **Beror på:** T1.4, T0.2

- [ ] `POST /api/maps` — title, description, slug (auto från title)
- [ ] Endast ADMIN
- [ ] Auditlogg-post

**Acceptans:** Ny kartfil syns i listan (FILE-4).

---

### T3.2 API: Lista kartfiler
**Prioritet:** Must · **Est:** 2h · **Beror på:** T3.1

- [ ] `GET /api/maps` — inkl. senaste version, rekommenderad version
- [ ] Reader+

**Acceptans:** Dashboard-data returneras korrekt.

---

### T3.3 API: Hämta kartfil med versionshistorik
**Prioritet:** Must · **Est:** 3h · **Beror på:** T3.1

- [ ] `GET /api/maps/[slug]` — alla versioner sorterade nyast först
- [ ] Inkludera uppladdare (namn, e-post)

**Acceptans:** All metadata per version (FILE-3).

---

### T3.4 API: Ladda upp ny version
**Prioritet:** Must · **Est:** 4h · **Beror på:** T2.1, T3.1, T1.4

- [ ] `POST /api/maps/[slug]/versions` — fil + valfri comment
- [ ] Auto-increment `versionNumber`
- [ ] Gamla versioner orörda (FILE-2)
- [ ] Efter lyckad upload: trigga parse-job (T4.2)
- [ ] Beräkna SHA-256, spara contentHash
- [ ] Auditlogg

**Acceptans:** v1 + v2 coexist; versionNumber stiger; parse-job köas.

### T3.5 Dashboard `/`
**Prioritet:** Must · **Est:** 4h · **Beror på:** T3.2

- [ ] Tabell/kort: kartnamn, senaste version, datum, uppladdare
- [ ] Länk till detaljsida
- [ ] Admin: knapp "Ny kartfil"

**Acceptans:** Inloggad användare ser alla kartfiler.

---

### T3.6 Kartdetalj `/maps/[slug]`
**Prioritet:** Must · **Est:** 6h · **Beror på:** T3.3, T2.2, T3.4

- [ ] Versionshistorik-tabell
- [ ] Nedladdningsknapp per version
- [ ] Upload-form (editor+): fil + kommentar
- [ ] "Jämför"-knapp (välj 2 versioner → compare)

**Acceptans:** Fullt flöde upload + download på en sida.

---

### T3.7 (Should) Markera rekommenderad version
**Prioritet:** Should · **Est:** 3h · **Beror på:** T3.4

- [ ] `PATCH /api/maps/[slug]/versions/[id]/recommend` — admin only
- [ ] Badge "Rekommenderad" i UI
- [ ] Default nedladdning = rekommenderad om satt, annars senaste

**Acceptans:** FILE-6 uppfyllt.

---

### T3.8 Seed: Importera exempelfil
**Prioritet:** Should · **Est:** 2h · **Beror på:** T3.4

- [ ] Seed-script skapar "Mora Väst med Venjan" med exempel `.ocd` från `Exempelfil/`
- [ ] Endast dev

**Acceptans:** Lokal dev har realistisk testdata.

---

## E4 — OCD-parsning & innehållsdiff

### T4.1 Integrera ocad2geojson
**Prioritet:** Must · **Est:** 4h · **Beror på:** T0.1

- [ ] `npm install ocad2geojson`
- [ ] `lib/ocad/read.ts`: wrapper runt `readOcad(buffer)`
- [ ] Validera mot exempelfil i `Exempelfil/` (~21 MB)
- [ ] Dokumentera AGPL-3.0 i README

**Acceptans:** Exempelfilen parsas utan crash; objectCount > 0.

---

### T4.2 Bakgrundsjobb: parsa uppladdad version
**Prioritet:** Must · **Est:** 6h · **Beror på:** T4.1, T3.4, T2.1

- [ ] Job köas efter upload (Inngest, Trigger.dev, eller Vercel Cron + queue-tabell)
- [ ] Hämta `.ocd` från R2 → parse → spara `objectCount`, `parseStatus`
- [ ] Generera SVG via `ocadToSvg`, spara `previewSvgPath` i R2
- [ ] Hantera timeout (Vercel Pro: max 300s) — ev. öka memory

**Acceptans:** Efter upload blir parseStatus `ok` inom rimlig tid; SVG tillgänglig.

---

### T4.3 Normalisera kartobjekt
**Prioritet:** Must · **Est:** 6h · **Beror på:** T4.1

- [ ] `lib/ocad/normalize.ts`: platt lista med `{ id, symbolNr, symbolName, type, centroid, geometryHash, text?, bbox }`
- [ ] Stöd punkt, linje, yta, text
- [ ] Enhetstester med mockade/parsed objekt

**Acceptans:** Två parsningar av samma fil ger identisk normaliserad lista.

---

### T4.4 Diff-algoritm
**Prioritet:** Must · **Est:** 8h · **Beror på:** T4.3

- [ ] `lib/ocad/diff.ts`: `compareVersions(objectsA, objectsB, options)`
- [ ] Spatial match med tolerans (konfigurerbar, default ~2 m i kart-CRS)
- [ ] Klassificera: `added`, `removed`, `modified` (geometri/symbol/text)
- [ ] Aggregera per symbol: `{ symbolNr, name, added, removed, modified }`
- [ ] Enhetstester: kända tillägg/borttag i testdata

**Acceptans:** DIFF-3/4/5/6 — korrekt klassificering på manuellt verifierade ändringar.

---

### T4.5 VersionDiff — modell & cache
**Prioritet:** Must · **Est:** 4h · **Beror på:** T4.4, T0.2

- [ ] Prisma-modell `VersionDiff` (versionAId, versionBId, summaryJson, changesJson, status)
- [ ] Unik constraint på (versionAId, versionBId) — A alltid äldre än B
- [ ] Beräkna diff async, spara resultat (DIFF-10)

**Acceptans:** Andra compare-request returnerar cachat resultat.

---

### T4.6 API: Jämför två versioner
**Prioritet:** Must · **Est:** 4h · **Beror på:** T4.5, T3.3

- [ ] `GET /api/maps/[slug]/compare?v1=&v2=`
- [ ] Returnera: metadata, summary (added/removed/modified), paginerad changes-lista
- [ ] Om diff saknas: köa beräkning, returnera `{ status: "pending" }`
- [ ] `POST` alternativ för att trigga om diff

**Acceptans:** DIFF-1/2/7 via API.

---

### T4.7 Jämförelsevy — sammanfattning
**Prioritet:** Must · **Est:** 5h · **Beror på:** T4.6

- [ ] `/maps/[slug]/compare?v1=&v2=`
- [ ] Kort: antal tillagda / borttagna / ändrade
- [ ] Tabell per symboltyp med siffror
- [ ] Loading/polling medan diff beräknas
- [ ] Visa parse-fel tydligt om någon version misslyckades

**Acceptans:** Användare ser sammanfattning på svenska.

---

### T4.8 Jämförelsevy — detaljerad ändringslista
**Prioritet:** Must · **Est:** 5h · **Beror på:** T4.7

- [ ] Paginerad tabell: typ (tillagd/borttagen/ändrad), symbol, position, text
- [ ] Filter: visa endast tillagda / borttagna / ändrade
- [ ] Klick på rad → fokusera i kartpreview (T4.9)

**Acceptans:** Alla ändringar går att bläddra igenom.

---

### T4.9 Jämförelsevy — SVG-preview
**Prioritet:** Must · **Est:** 6h · **Beror på:** T4.2, T4.7

- [ ] Visa SVG version A och B sida vid sida
- [ ] Markera ändrade bbox: grön=tillagd, röd=borttagen, gul=ändrad
- [ ] Zoom/pan (t.ex. react-zoom-pan-pinch eller panzoom på SVG)
- [ ] "(Should) Hoppa till ändring"-knappar per rad i listan

**Acceptans:** DIFF-8 — visuell bekräftelse av ändringar.

---

### T4.10 Dublettvarning vid upload
**Prioritet:** Should · **Est:** 2h · **Beror på:** T3.4

- [ ] Jämför contentHash med föregående version
- [ ] Varna i UI: "Identiskt innehåll som version N" före confirm

**Acceptans:** Identisk filuppladdning flaggas.

---

### T4.11 PoC: diff mot exempelfil (dev)
**Prioritet:** Should · **Est:** 3h · **Beror på:** T4.4, T3.8

- [ ] Script: ladda upp samma fil två gånger → diff ska visa 0 ändringar
- [ ] (Manuellt) redigera kopia i OCAD → verifiera att diff fångar ändringen

**Acceptans:** Team har verifierat diff mot verklig kartdata.

---

## E5 — Adminpanel

### T5.1 Admin: skapa användarkonto
**Prioritet:** Must · **Est:** 4h · **Beror på:** T1.2

- [ ] `/admin/users` — formulär: e-post, lösenord (eller generera), namn, roll
- [ ] `POST /api/admin/users` (ADMIN-1)
- [ ] Validering: unik e-post, giltig roll

**Acceptans:** Admin kan skapa Reader/Editor/Admin-konton; nya användare kan logga in direkt.

---

### T5.2 Lista och hantera användare
**Prioritet:** Must · **Est:** 4h · **Beror på:** T5.1

- [ ] `GET /api/admin/users` — alla användare med roll, skapad datum, skapad av
- [ ] `PATCH /api/admin/users/[id]` — ändra roll, inaktivera konto (ADMIN-2)
- [ ] Auditlogg vid rolländring
- [ ] Skydd: kan inte nedgradera/radera sista admin

**Acceptans:** Admin kan lista, ändra roll och inaktivera användare.

---

### T5.3 Hantera alla användares roller
**Prioritet:** Must · **Est:** 3h · **Beror på:** T5.2

- [ ] Lista alla användare med nuvarande roll
- [ ] Dropdown: ändra roll (inte nedgradera sista admin)

**Acceptans:** RBAC-2 i UI.

---

### T5.4 Admin-översikt kartfiler
**Prioritet:** Must · **Est:** 3h · **Beror på:** T3.2

- [ ] `/admin/maps` — antal versioner, senaste aktivitet, lagringsstorlek

**Acceptans:** ADMIN-3 uppfyllt.

---

### T5.5 (Should) Badge/notis: admin-åtgärder — **Nedprioriterad**

> Pending-badge ej relevant i MVP (inga väntande konton). Kan återinföras vid OAuth/självregistrering.

---

## E6 — Auditlogg

### T6.1 Audit-service
**Prioritet:** Must · **Est:** 3h · **Beror på:** T0.2

- [ ] `lib/audit.ts`: `logAction(userId, action, targetType, targetId, metadata)`
- [ ] Actions: `LOGIN`, `UPLOAD`, `DOWNLOAD`, `ROLE_CHANGE`, `MAP_CREATE`, `COMPARE`

**Acceptans:** AUDIT-1 — alla kritiska händelser loggas.

---

### T6.2 Integrera audit i API routes
**Prioritet:** Must · **Est:** 3h · **Beror på:** T6.1, E3, E5

- [ ] Anrop till `logAction` i upload, download, admin PATCH, login

**Acceptans:** Händelser dyker upp i databasen.

---

### T6.3 Admin-vy `/admin/audit`
**Prioritet:** Should · **Est:** 4h · **Beror på:** T6.2

- [ ] Paginerad lista, filter på användare, kartfil, action
- [ ] Export CSV (optional)

**Acceptans:** AUDIT-2 uppfyllt.

---

## E7 — UI & polish

### T7.1 Tomt tillstånd och felmeddelanden
**Prioritet:** Should · **Est:** 3h

- [ ] Inga kartfiler ännu
- [ ] Inga versioner
- [ ] 404 kartfil
- [ ] Nätverksfel vid upload

---

### T7.2 Loading states
**Prioritet:** Should · **Est:** 2h

- [ ] Skeleton på dashboard
- [ ] Spinner på download redirect

---

### T7.3 Bekräftelsedialoger
**Prioritet:** Should · **Est:** 2h

- [ ] Bekräfta upload
- [ ] Bekräfta rolländring (admin)

---

### T7.4 Tillgänglighet grund
**Prioritet:** Could · **Est:** 3h

- [ ] Fokus-stilar, aria-labels på knappar
- [ ] Tangentbordsnavigering i tabeller

---

### T7.5 Mobilanpassning
**Prioritet:** Should · **Est:** 4h

- [ ] Tabeller → kort på smal skärm
- [ ] Upload fungerar på surfplatta

---

## E8 — Deploy & drift

### T8.1 Produktionsmiljö Vercel
**Prioritet:** Must · **Est:** 4h · **Beror på:** E0–E6

- [ ] Vercel-projekt kopplat till repo
- [ ] Env-variabler satta (prod)
- [ ] Custom domain **`kartor.ifkmora.se`** (DNS CNAME → Vercel)

**Acceptans:** Prod-URL fungerar med e-post/lösenord-inloggning.

---

### T8.5 AGPL — publicera källkod
**Prioritet:** Must · **Est:** 1h · **Beror på:** T0.1

- [ ] GitHub repo (publikt eller org) med LICENSE + länk i sidfot
- [ ] README nämner ocad2geojson AGPL-beroende

---

### T8.2 Produktionsdatabas (Neon/Supabase)
**Prioritet:** Must · **Est:** 2h · **Beror på:** T0.2

- [ ] Prod PostgreSQL
- [ ] `prisma migrate deploy` i CI/deploy

---

### T8.3 Backup-rutin dokumenterad
**Prioritet:** Should · **Est:** 2h

- [ ] R2 lifecycle / backup-bucket
- [ ] DB backup via leverantör
- [ ] Runbook i README

---

### T8.4 Säkerhetsgranskning checklista
**Prioritet:** Must · **Est:** 2h

- [ ] HTTPS enforced
- [ ] Lösenord hashade med bcrypt; aldrig i klartext
- [ ] Signed URLs only för filer
- [ ] Inga secrets i repo
- [ ] Rate limit på upload API (Vercel/middleware)

---

## Implementeringsordning (sprintförslag)

### Sprint 1 (vecka 1–2): Fundament
```
T0.1 → T0.2 → T0.3 → T0.4
T1.1 → T1.2 → T1.3 → T1.4
T6.1
T4.1                    ← tidig validering av ocad2geojson
```

### Sprint 2 (vecka 2–3): Filer + parsning
```
T2.1 → T2.2 → T2.3
T3.1 → T3.2 → T3.3 → T3.4
T4.2 → T4.3
T6.2
```

### Sprint 3 (vecka 3–5): Diff + UI
```
T4.4 → T4.5 → T4.6
T4.7 → T4.8 → T4.9
T3.5 → T3.6
T4.10, T4.11, T3.8
```

### Sprint 4 (vecka 5–6): Admin + deploy
```
T5.1 → T5.2 → T5.3 → T5.4
T6.3, T7.*
T8.1 → T8.2 → T8.3 → T8.4 → T8.5
T0.5, T3.7
```

---

## Miljövariabler (referens)

```env
# Auth
AUTH_SECRET=
INITIAL_ADMIN_EMAIL=buud212@gmail.com
INITIAL_ADMIN_PASSWORD=          # endast seed/bootstrap; rotera efter deploy

# Database
DATABASE_URL=

# R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=                  # ej publikt — endast för SDK endpoint

# Bakgrundsjobb (välj en)
INNGEST_EVENT_KEY=              # eller TRIGGER_DEV_API_KEY

# App
NEXT_PUBLIC_APP_URL=https://kartor.ifkmora.se
MAX_UPLOAD_BYTES=104857600      # 100 MB
DIFF_SPATIAL_TOLERANCE_M=2      # meter för objektmatchning
```

---

## Definition of Done (globalt)

- [ ] Kod mergad till main
- [ ] TypeScript utan fel
- [ ] Rollkontroll testad manuellt
- [ ] Svenska UI-texter
- [ ] Auditlogg för relevant action
- [ ] Fungerar i Chrome + mobil viewport

---

## Risker

| Risk | Sannolikhet | Åtgärd |
|------|-------------|--------|
| Stora uploads timeout på Vercel | Medel | Presigned direct upload till R2 från klient |
| Parse/diff timeout (21 MB .ocd) | Hög | Bakgrundsjobb (Inngest); Vercel Pro 300s limit |
| ocad2geojson missar objekt | Medel | Visa parse-varning; manuell OCAD-verifiering i T4.11 |
| Falska diff-träffar (flyttade objekt) | Medel | Finjustera spatial tolerans; iterera i Fas 2 |
| AGPL-licens | Låg | Publicera källkod (T8.5) |
| Felaktigt/läckt lösenord | Medel | Admin skapar nytt konto eller reset-flöde i Fas 2 |
| Användare laddar upp fel fil | Medel | Tydlig kartväljare + obligatorisk kommentar |

> **Viktigt (T2.1):** Vercel Serverless har begränsad request body. Planera **presigned upload direkt till R2** från webbläsaren, inte proxy via API route.

---

## E9 — Checkout/checkin (v0.5)

> **PRD:** §18, §6.7 (`CHECKOUT-*`)  
> **Förutsättning:** MVP (E3 kartfiler, E4 diff, E6 audit, befintlig e-postinfrastruktur)  
> **Uppskattad tid:** 12–16 arbetsdagar

### Översikt faser

| Fas | Tickets | Fokus | Komplexitet |
|-----|---------|-------|-------------|
| 9A Datamodell & lås | T9.1–T9.3 | Schema, RBAC, overlap | M–L |
| 9B Urval & export | T9.4–T9.6 | Area UI, subset .ocd, checkout API | L |
| 9C Visualisering & checkin | T9.7–T9.9 | Overlay, upload, subset-diff | M–L |
| 9D Integration & bekräftelse | T9.10–T9.13 | Rebase, dual confirm, admin cancel | L–M |
| 9E Notifiering & polish | T9.14–T9.18 | E-post, cron, varning, audit | S–M |

---

### T9.1 Prisma-schema `MapCheckout`
**Prioritet:** Must · **Est:** 4h · **Komplexitet:** M · **Beror på:** T0.2, E3

- [ ] Modell enligt PRD §8: `MapCheckout` med status, area, objectIds, storage paths, timestamps
- [ ] Enum `CheckoutStatus`: `ACTIVE`, `CHECKIN_PENDING`, `USER_CONFIRMED`, `INTEGRATED`, `CANCELLED`
- [ ] Enum `CheckoutAreaType`: `RECTANGLE`, `POLYGON`
- [ ] Relationer: `mapFileId`, `baseVersionId`, `checkedOutBy`, `integratedVersionId`, `cancelledBy`, `adminConfirmedBy`
- [ ] Index på `(mapFileId, status)` för snabb lookup av aktiva checkouts

**Acceptans:** Migration körs; CRUD via Prisma fungerar.

---

### T9.2 RBAC för checkout
**Prioritet:** Must · **Est:** 2h · **Komplexitet:** S · **Beror på:** T1.4, T9.1

- [ ] `canCheckout`, `canCheckin`, `canConfirmIntegration`, `canForceCancelCheckout` i `lib/auth/permissions.ts`
- [ ] Reader: nekas checkout; Editor: egen checkout; Admin: allt + force cancel + admin-bekräftelse
- [ ] Server-side checks i alla checkout-API routes

**Acceptans:** CHECKOUT-13, CHECKOUT-14 — rollkontroll enligt PRD §4.

---

### T9.3 Låslogik och overlap-detektering
**Prioritet:** Must · **Est:** 8h · **Komplexitet:** L · **Beror på:** T9.1, T4.3

- [ ] `lib/checkout/locks.ts`: kontrollera spatial overlap mellan ny area och aktiva checkouts
- [ ] Objektnivå: två checkouts får inte dela samma objectId (intersect av `objectIdsJson`)
- [ ] Geometri: polygon/rektangel-intersect i kart-CRS (t.ex. Turf.js eller egen bbox+polygon)
- [ ] Returnera tydligt fel: vilken checkout som blockerar

**Acceptans:** CHECKOUT-3 — överlappande checkout nekas.

---

### T9.4 UI: områdesurval (rektangel/polygon)
**Prioritet:** Must · **Est:** 10h · **Komplexitet:** L · **Beror på:** T4.9, T3.6

- [x] `/maps/[slug]/checkout` — rita rektangel eller polygon ovanpå SVG-kartpreview
- [x] Växla verktyg: rektangel / polygon (minst 3 hörn)
- [x] Visa befintliga checkout-områden som read-only overlay (förbereder T9.7)
- [x] Bekräfta valt område → POST checkout

**Acceptans:** CHECKOUT-1 — användare kan definiera område visuellt.

---

### T9.5 Subset .ocd-export
**Prioritet:** Must · **Est:** 12h · **Komplexitet:** L · **Beror på:** T4.1, T4.3, T9.3

- [x] `lib/ocad/subset-export.ts`: filtrera objekt vars bbox/centroid intersectar checkout-area
- [x] Generera subset `.ocd` (PoC: utred OCAD-skrivning vs export-format som OCAD kan öppna)
- [x] Spara `objectIdsJson` och `subsetStoragePath` på MapCheckout
- [x] Hantera parse-varningar; dokumentera begränsningar

**Acceptans:** CHECKOUT-2 — nedladdad fil innehåller endast objekt inom området och öppnas i OCAD.

---

### T9.6 API: skapa checkout och ladda ner subset
**Prioritet:** Must · **Est:** 6h · **Komplexitet:** M · **Beror på:** T9.3, T9.5, T2.2

- [x] `POST /api/maps/[slug]/checkouts` — areaType, areaGeometryJson; baseras på senaste version (head)
- [x] Kör overlap-kontroll; skapa MapCheckout med status `ACTIVE`
- [x] `GET /api/maps/[slug]/checkouts/[id]/download` — signerad URL till subset .ocd
- [x] Auditlogg: `CHECKOUT_CREATED`

**Acceptans:** Fullt checkout-flöde från API; subset nedladdningsbar.

---

### T9.7 Checkout-overlay på kartdetalj
**Prioritet:** Must · **Est:** 6h · **Komplexitet:** M · **Beror på:** T9.4, T3.6

- [x] `/maps/[slug]` visar alla aktiva checkouts som färgade polygoner/rektanglar
- [x] Tooltip/lista: ägare (namn), skapad datum, status
- [x] Reader ser overlay read-only; Editor ser knapp "Checka ut område"

**Acceptans:** CHECKOUT-4 — alla inloggade ser vem som checkat ut vad.

---

### T9.8 API: checkin-uppladdning
**Prioritet:** Must · **Est:** 5h · **Komplexitet:** M · **Beror på:** T9.6, T2.1

- [x] `POST /api/maps/[slug]/checkouts/[id]/checkin` — presigned upload av redigerad subset .ocd
- [x] Validera filtyp/storlek; spara `checkinStoragePath`; status → `CHECKIN_PENDING`
- [x] Trigga subset-diff (T9.9) asynkront
- [x] Auditlogg: `CHECKIN_SUBMITTED`

**Acceptans:** Editor kan ladda upp redigerad subset efter offline-arbete.

---

### T9.9 Subset-diff (endast checkade objekt)
**Prioritet:** Must · **Est:** 8h · **Komplexitet:** L · **Beror på:** T4.4, T9.5, T9.8

- [x] `lib/checkout/subset-diff.ts`: diffa checkin-subset mot **aktuell head-version**
- [x] Begränsa till objekt i `objectIdsJson` (+ nya objekt inom checkout-area)
- [x] Flagga om head ändrats sedan `baseVersionId` (rebase-varning)
- [x] Spara diff-resultat på checkout-post (JSON) för granskning

**Acceptans:** CHECKOUT-5, CHECKOUT-6 — diff endast relevanta objekt mot senaste version.

---

### T9.10 Integration mot head (rebase/merge)
**Prioritet:** Must · **Est:** 10h · **Komplexitet:** L · **Beror på:** T9.9, T4.4

- [x] `lib/checkout/integrate.ts`: applicera bekräftade ändringar på parsad head → ny `.ocd`
- [x] Hantera tillagda/borttagna/ändrade inom checkout-scope
- [x] Skapa ny `MapVersion`; koppla `integratedVersionId`; status → `INTEGRATED`
- [x] Trigga parse-job för ny version (T4.2)

**Acceptans:** Efter dubbel bekräftelse skapas ny version med integrerade ändringar.

---

### T9.11 Gransknings- och bekräftelsevy (användare)
**Prioritet:** Must · **Est:** 6h · **Komplexitet:** M · **Beror på:** T9.9, T4.7

- [x] `/maps/[slug]/checkout/[id]` — visa subset-diff (sammanfattning + SVG-markeringar)
- [x] Knapp "Bekräfta integration" (checkout-ägare); status → `USER_CONFIRMED`
- [x] Tydlig text: väntar på admin-bekräftelse efter användarens godkännande

**Acceptans:** CHECKOUT-7 — användare måste bekräfta innan admin kan integrera.

---

### T9.12 Admin-bekräftelse av integration
**Prioritet:** Must · **Est:** 4h · **Komplexitet:** M · **Beror på:** T9.11, T9.10

- [x] Admin-vy (checkout-detalj eller `/admin/checkouts`): granska diff
- [x] Knapp "Bekräfta och integrera" → kör T9.10; spara `adminConfirmedAt`, `adminConfirmedBy`
- [x] Endast tillgänglig när status = `USER_CONFIRMED`

**Acceptans:** CHECKOUT-8 — både användare och admin måste bekräfta.

---

### T9.13 Admin: force cancel checkout
**Prioritet:** Must · **Est:** 3h · **Komplexitet:** S · **Beror på:** T9.6, T1.4

- [x] `DELETE /api/maps/[slug]/checkouts/[id]` — admin only
- [x] Status → `CANCELLED`; spara `cancelledBy`, `cancelReason` (valfri)
- [x] Frigör lås; auditlogg: `CHECKOUT_CANCELLED`

**Acceptans:** CHECKOUT-9 — admin kan avbryta checkout utan integration.

---

### T9.14 E-postnotiser (alla checkout-händelser)
**Prioritet:** Must · **Est:** 6h · **Komplexitet:** M · **Beror på:** T9.6, T9.8, T9.12, T9.13

- [x] Återanvänd befintlig e-postinfrastruktur (Gmail SMTP / befintlig `lib/email`)
- [x] Mallar (svenska): checkout skapad, checkin inskickad, integration bekräftad, checkout avbruten
- [x] Mottagare: checkout-ägare + admin (konfigurerbar lista)
- [x] Länk till checkout-detalj i varje mail

**Acceptans:** CHECKOUT-10 — e-post vid alla fyra händelsetyper.

---

### T9.15 Cron: påminnelse för inaktiva checkouts
**Prioritet:** Must · **Est:** 4h · **Komplexitet:** M · **Beror på:** T9.14, T9.1

- [x] Vercel Cron (eller befintlig jobbinfrastruktur): daglig körning
- [x] Hitta checkouts med status `ACTIVE` och `createdAt` > `CHECKOUT_REMINDER_DAYS` (default 7)
- [x] Skicka påminnelse-e-post; uppdatera `reminderSentAt`
- [x] Env: `CHECKOUT_REMINDER_DAYS=7`

**Acceptans:** CHECKOUT-11 — påminnelse efter konfigurerat antal dagar.

---

### T9.16 Varning vid full uppladdning
**Prioritet:** Must · **Est:** 2h · **Komplexitet:** S · **Beror på:** T3.4, T9.7

- [x] Vid upload-form på `/maps/[slug]`: om aktiva checkouts finns → visa varningsdialog
- [x] Lista berörda checkouts (ägare, område, datum)
- [x] Användaren kan fortsätta eller avbryta

**Acceptans:** CHECKOUT-12 — full upload tillåten med tydlig varning.

---

### T9.17 Auditlogg checkout-händelser
**Prioritet:** Must · **Est:** 2h · **Komplexitet:** S · **Beror på:** T6.1, E9

- [x] Actions: `CHECKOUT_CREATED`, `CHECKIN_SUBMITTED`, `CHECKOUT_USER_CONFIRMED`, `CHECKOUT_INTEGRATED`, `CHECKOUT_CANCELLED`, `CHECKOUT_REMINDER_SENT`
- [x] Integrera i alla checkout-API routes och cron

**Acceptans:** CHECKOUT-16 — spårbarhet i auditlogg.

---

### T9.18 Checkout-lista på kartdetalj
**Prioritet:** Must · **Est:** 4h · **Komplexitet:** M · **Beror på:** T9.7, T3.6

- [x] Tabell/sektion "Aktiva checkouts" på `/maps/[slug]`
- [x] Kolumner: område (thumbnail/miniatyr), ägare, skapad, status, åtgärder
- [x] Editor: länk till egna checkouts; Admin: länk till alla + avbryt

**Acceptans:** Översiktlig lista kompletterar kart-overlay.

---

## Implementeringsordning — checkout (E9)

### Sprint 5 (vecka 7–8): Datamodell & lås
```
T9.1 → T9.2 → T9.3
T9.17 (audit actions definierade)
```

### Sprint 6 (vecka 8–9): Urval & export
```
T9.4 → T9.5 → T9.6
T9.7 (overlay grund)
```

### Sprint 7 (vecka 9–10): Checkin & diff
```
T9.8 → T9.9
T9.18 (lista)
```

### Sprint 8 (vecka 10–11): Integration & bekräftelse
```
T9.10 → T9.11 → T9.12 → T9.13
```

### Sprint 9 (vecka 11–12): Notifiering & polish
```
T9.14 → T9.15 → T9.16
Manuell E2E-test av hela checkout-flödet
```

---

## Miljövariabler — checkout (tillägg)

```env
CHECKOUT_REMINDER_DAYS=7           # dagar innan påminnelse-e-post
CHECKOUT_ADMIN_NOTIFY_EMAIL=       # valfritt; default alla admins
```

---

## Risker — checkout

| Risk | Sannolikhet | Åtgärd |
|------|-------------|--------|
| Subset .ocd inte öppningsbar i OCAD | Hög | PoC tidigt (T9.5); ev. OCAD batch/script som fallback |
| Rebase-konflikter vid parallell head-ändring | Medel | Tydlig diff-granskning; flagga konflikter i UI |
| Polygon-precision i webb-SVG vs kart-CRS | Medel | Enhetstester med kända koordinater |
| Långvariga checkouts blockerar områden | Medel | Påminnelse (T9.15) + admin force cancel (T9.13) |

---

## E10 — Lägg bana (v0.6)

> **PRD:** §20, §6.8 (`COURSE-*`)  
> **Förutsättning:** MVP (E3 kartfiler, E4 parsning/SVG, E7 kartvy "Hela kartan")  
> **Uppskattad tid:** 14–18 arbetsdagar

### Översikt faser

| Fas | Tickets | Fokus | Komplexitet |
|-----|---------|-------|-------------|
| 10A Schema & API | T10.1–T10.4, T10.19 | Datamodell, CRUD, overlay-lagring, audit | M |
| 10B Editor grund | T10.5–T10.7 | Kartläge, symbolpanel, punktplacering | M–L |
| 10C Rita & text | T10.8–T10.10 | Linje/yta, textmodal | L |
| 10D Verktyg & spara | T10.11–T10.14 | Flytta/radera, save/load, privat/publik | M |
| 10E Skuggbana & lista | T10.15–T10.16 | Ghost course, kontrollista | M |
| 10F PDF-export | T10.17–T10.18 | A4/A3, skala, utskrift | L |

---

### T10.1 Prisma-schema `Course` och `CourseObject`
**Prioritet:** Must · **Est:** 4h · **Komplexitet:** M · **Beror på:** T0.2, E3

- [x] Modeller enligt PRD §8: `Course`, `CourseObject`
- [x] `Course`: `mapFileId`, `name`, `createdBy`, `isPublic` (default `false`), timestamps
- [x] `CourseObject`: `courseId`, `symbolNr` (700–709), `objectType` enum (`POINT`, `LINE`, `AREA`, `TEXT`), `geometryJson`, `textContent`, `sortOrder`
- [x] Index på `(mapFileId, isPublic)` och `(courseId, sortOrder)`
- [x] Cascade delete: CourseObject raderas med Course

**Acceptans:** Migration körs; CRUD via Prisma fungerar.

---

### T10.2 RBAC för banor
**Prioritet:** Must · **Est:** 2h · **Komplexitet:** S · **Beror på:** T1.4, T10.1

- [x] `canCreateCourse`, `canEditCourse`, `canViewCourse` i `lib/auth/permissions.ts`
- [x] **Alla inloggade** (Reader, Editor, Admin) kan skapa banor (COURSE-16)
- [x] Redigera/radera: endast ägare eller admin
- [x] Visa: ägare ser privata; alla reader+ ser publika

**Acceptans:** COURSE-10, COURSE-11 — rollkontroll enligt PRD §17.

---

### T10.3 API: CRUD banor
**Prioritet:** Must · **Est:** 6h · **Komplexitet:** M · **Beror på:** T10.1, T10.2

- [x] `GET /api/maps/[slug]/courses` — egna + publika banor på kartfilen
- [x] `POST /api/maps/[slug]/courses` — skapa bana: `name`, `isPublic` (default false)
- [x] `GET /api/maps/[slug]/courses/[id]` — hämta bana med objekt (ägarskap/synlighet)
- [x] `PATCH /api/maps/[slug]/courses/[id]` — uppdatera namn, `isPublic`
- [x] `DELETE /api/maps/[slug]/courses/[id]` — ägare eller admin
- [x] Auditlogg: `COURSE_CREATED`, `COURSE_UPDATED`, `COURSE_DELETED`

**Acceptans:** COURSE-8, COURSE-9 — spara med namn; privat/publik.

---

### T10.4 API: CRUD overlay-objekt
**Prioritet:** Must · **Est:** 6h · **Komplexitet:** M · **Beror på:** T10.3

- [x] `PUT /api/maps/[slug]/courses/[id]/objects` — bulk upsert objektlista (ersätter alla)
- [x] Validera `symbolNr` 700–709, `objectType`, GeoJSON-geometri i kart-CRS
- [x] `sortOrder` sätts i placeringsordning (kontrollista)
- [x] Max objekt soft limit (500) med varning i svar

**Acceptans:** Overlay lagras som JSON; påverkar aldrig MapVersion (COURSE-12).

---

### T10.5 Kartläge "Lägg bana" i "Hela kartan"
**Prioritet:** Must · **Est:** 8h · **Komplexitet:** L · **Beror på:** T4.9, T3.6

- [x] Växla läge i befintlig kartvy (`diff-map-panel` / `fullscreen-map-viewer`-mönster)
- [x] Bakgrund: **senaste head-version** SVG (COURSE-2)
- [x] Toolbar: "Lägg bana" / "Visa" / verktyg (förbereder T10.11)
- [x] Layout: karta vänster, symbolpanel höger (COURSE-3)

**Acceptans:** COURSE-1 — inloggad användare kan öppna banläge mot head.

---

### T10.6 Symbolpanel 700–709
**Prioritet:** Must · **Est:** 6h · **Komplexitet:** M · **Beror på:** T10.5

- [x] Panel till höger: alla symboler **700–709** med namn/ikon
- [x] `lib/course/symbols.ts`: metadata (nummer, etikett, tillåten geometrityp)
- [x] Välj aktiv symbol → cursor/verktygsläge ändras
- [x] Approximerade SVG-ikoner per symbol (dokumentera begränsning)

**Acceptans:** COURSE-3 — alla symboler 700–709 tillgängliga.

---

### T10.7 Punktplacering
**Prioritet:** Must · **Est:** 6h · **Komplexitet:** M · **Beror på:** T10.5, T10.6

- [x] Klick på karta → skapa punktobjekt med aktiv symbol
- [x] Koordinater i kart-CRS (samma transform som befintlig SVG-viewer)
- [x] Rendera overlay ovanpå bakgrundskarta
- [x] Uppdatera lokal state; spara via T10.4

**Acceptans:** COURSE-4 — punktplacering fungerar för punkt-symboler.

---

### T10.8 Linjerita
**Prioritet:** Must · **Est:** 8h · **Komplexitet:** L · **Beror på:** T10.7

- [x] Klick för vertex; dubbelklick/Enter avslutar linje
- [x] Esc avbryter pågående ritning
- [x] Preview-linje under ritning
- [x] Endast symboler med linje-geometrityp tillåtna

**Acceptans:** COURSE-4 — linjeobjekt kan ritas och sparas.

---

### T10.9 Ytrita (polygon)
**Prioritet:** Must · **Est:** 8h · **Komplexitet:** L · **Beror på:** T10.8

- [x] Klick för hörn; stäng polygon (klick nära start eller knapp "Avsluta")
- [x] Minst 3 hörn krävs
- [x] Preview under ritning
- [ ] Validering: self-intersect varning (Should)

**Acceptans:** COURSE-4 — yta/polygon kan ritas och sparas.

---

### T10.10 Textmodal och textplacering
**Prioritet:** Must · **Est:** 5h · **Komplexitet:** M · **Beror på:** T10.7

- [x] Välj textsymbol → klick placerar punkt → **modal** för textinmatning
- [x] Redigera text via dubbelklick på befintligt textobjekt
- [x] Spara `textContent` på CourseObject
- [x] Rendera textlabel ovanpå karta

**Acceptans:** COURSE-6 — textmodal vid textobjekt.

---

### T10.11 Verktyg: flytta
**Prioritet:** Must · **Est:** 6h · **Komplexitet:** M · **Beror på:** T10.7

- [x] Verktyg "Flytta" i toolbar
- [x] Klicka objekt → dra till ny position
- [x] Punkt: flytta centroid; linje/yta: flytta alla vertex (hela objektet)
- [x] Uppdatera geometri i state + spara

**Acceptans:** COURSE-7 — flytta overlay-objekt.

---

### T10.12 Verktyg: radera
**Prioritet:** Must · **Est:** 3h · **Komplexitet:** S · **Beror på:** T10.7

- [x] Verktyg "Radera" eller Delete-tangent på valt objekt
- [x] Bekräftelse vid radering (Should)
- [x] Omnumrera `sortOrder` för kontrollista efter radering

**Acceptans:** COURSE-7 — radera overlay-objekt.

---

### T10.13 Spara/ladda bana i editorn
**Prioritet:** Must · **Est:** 5h · **Komplexitet:** M · **Beror på:** T10.3, T10.4, T10.5

- [x] "Spara"-knapp: namn (vid ny), `isPublic`-kryssruta
- [x] "Öppna"-dropdown: egna + publika banor på kartfilen
- [x] Ladda objekt till editor-state
- [x] Ny bana vs uppdatera befintlig

**Acceptans:** COURSE-8 — spara och ladda banor med namn.

---

### T10.14 Lista banor på kartdetalj
**Prioritet:** Must · **Est:** 4h · **Komplexitet:** M · **Beror på:** T10.3, T3.6

- [x] Sektion "Banor" på `/maps/[slug]`: egna + publika
- [x] Kolumner: namn, ägare, skapad, publik/privat, åtgärder
- [x] Länk till öppna i "Lägg bana"-läge
- [x] Admin kan radera valfri bana

**Acceptans:** Publika banor synliga för alla; privata endast för ägare.

---

### T10.15 Skuggbana (ghost)
**Prioritet:** Must · **Est:** 5h · **Komplexitet:** M · **Beror på:** T10.13

- [x] Dropdown "Visa skuggbana" — välj annan sparad bana (egen eller publik)
- [x] Rendera skuggbana **halvtransparent** (read-only)
- [x] En aktiv redigerbar bana + högst en skuggbana
- [x] Toggle av/på utan att påverka aktiv bana

**Acceptans:** COURSE-13 — skuggbana för jämförelse.

---

### T10.16 Kontrollista med auto-numrering
**Prioritet:** Must · **Est:** 5h · **Komplexitet:** M · **Beror på:** T10.4, T10.13

- [x] Panel eller sidosektion: kontrollista 1, 2, 3 … efter `sortOrder`
- [x] Filtrera objekt med kontroll-symbol (702; ev. 704–709)
- [x] Klick på rad → zoom/fokus på kontroll i karta
- [x] Uppdateras vid placering, flytt, radering

**Acceptans:** COURSE-14 — auto-numrering i placeringsordning.

---

### T10.17 PDF-export — format och layout
**Prioritet:** Must · **Est:** 10h · **Komplexitet:** L · **Beror på:** T10.13, befintlig PDF-export

- [x] `GET /api/maps/[slug]/courses/[id]/export/pdf` — query: `format` (A4/A3), `orientation` (portrait/landscape), `scale`
- [x] Återanvänd befintlig kart-PDF-motor (samma familj som övrig kartexport)
- [x] PDF: bakgrundskarta (head) + overlay + valfri kontrollista
- [x] Auditlogg: `COURSE_PDF_EXPORT`

**Acceptans:** COURSE-15 — A4/A3, liggande/stående.

---

### T10.18 PDF-export — skala och förhandsgranskning
**Prioritet:** Must · **Est:** 6h · **Komplexitet:** M · **Beror på:** T10.17

- [x] UI: välj skala (t.ex. 1:7500, 1:10000, 1:15000; intervall enligt PRD §20.9)
- [x] Beräkna utskriftsarea utifrån skala + pappersformat
- [ ] Förhandsgranska crop/omfång innan export
- [x] Enhetstester för skala-matematik (kritisk risk)

**Acceptans:** COURSE-15 — användarvald skala med korrekt proportioner.

---

### T10.19 Auditlogg ban-händelser
**Prioritet:** Should · **Est:** 2h · **Komplexitet:** S · **Beror på:** T6.1, E10

- [x] Actions: `COURSE_CREATED`, `COURSE_UPDATED`, `COURSE_DELETED`, `COURSE_PDF_EXPORT`
- [x] Integrera i alla course-API routes

**Acceptans:** COURSE-17 — spårbarhet i auditlogg.

---

## Implementeringsordning — Lägg bana (E10)

### Sprint 10 (vecka 13–14): Schema & API
```
T10.1 → T10.2 → T10.3 → T10.4
T10.19 (audit actions)
```

### Sprint 11 (vecka 14–15): Editor grund
```
T10.5 → T10.6 → T10.7
T10.14 (banlista grund)
```

### Sprint 12 (vecka 15–16): Rita & text
```
T10.8 → T10.9 → T10.10
```

### Sprint 13 (vecka 16–17): Verktyg & spara
```
T10.11 → T10.12 → T10.13
```

### Sprint 14 (vecka 17–18): Skuggbana, lista, PDF
```
T10.15 → T10.16
T10.17 → T10.18
Manuell E2E-test av hela banflödet
```

---

## Miljövariabler — Lägg bana (tillägg)

```env
COURSE_MAX_OBJECTS=500              # soft limit per bana
COURSE_PDF_SCALE_MIN=4000           # minsta skala (1:N)
COURSE_PDF_SCALE_MAX=20000          # största skala (1:N)
COURSE_CONTROL_SYMBOLS=702          # kommaseparerade symbolnummer för kontrollista
```

---

## Risker — Lägg bana

| Risk | Sannolikhet | Åtgärd |
|------|-------------|--------|
| OCAD-symbolutseende approximeras i webben | Hög | T10.6 — dokumentera; iterera SVG-ikoner; acceptera i v1 |
| PDF-skala-matematik fel | Medel | T10.18 enhetstester; återanvänd befintlig PDF-kod |
| Stort scope (alla geometrityper + PDF) | Medel | Strikt fasindelning E10A–F; leverera punkt först |
| Head-ändring vs sparade overlay-koordinater | Låg–Medel | Visa head-versionsdatum i editor; ev. varning (PRD §20.6) |
| Prestanda vid många overlay-objekt | Låg | Soft limit 500; SVG-layer optimering |

---

*Nästa steg: E10 efter E9, starta T10.1 + T10.5 (schema + kartläge parallellt).*
