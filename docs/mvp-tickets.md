# MVP — Implementationstickets

> **Kopplad till:** [prd.md](../prd.md) v0.4  
> **Fas:** 1 — MVP  
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

**Totalt:** ~50 tickets · ~32–42 arbetsdagar

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

*Nästa steg: starta T0.1 + T4.1 (PoC parse exempelfil).*
