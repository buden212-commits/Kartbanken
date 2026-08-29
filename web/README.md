# kartor.ifkmora.se — webbapp

Webbapp för versionshantering och OCD-jämförelse av orienteringskartor (IFK Mora).

## Kom igång (lokal utveckling)

```bash
cd web
cp .env.example .env   # redigera med lokala värden
npm install
npm run db:migrate
npm run db:seed    # skapar admin från .env
npm run dev
```

Öppna [http://localhost:3000/login](http://localhost:3000/login).

## Hjälp och commit

Hjälpsidan (`/hjalp`) och release notes (`web/src/lib/help/release-notes.ts`) ska uppdateras i samma commit som app-ändringar.

Aktivera pre-commit-kontroll (en gång per klonat repo):

```bash
npm run hooks:install
```

Vid commit utan hjälpuppdatering blockeras commiten. Hoppa över vid behov: `SKIP_HELP_CHECK=1 git commit` eller `git commit --no-verify`.

## Inloggning (e-post + lösenord)

Google-inloggning är pausad. Admin skapar konton manuellt under `/admin/users`.

Sätt i `.env` (kopiera från `.env.example`):

```env
AUTH_SECRET=generera-med-openssl-rand-base64-32
AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
INITIAL_ADMIN_EMAIL=buud212@gmail.com
INITIAL_ADMIN_PASSWORD=ditt-admin-lösenord
DATABASE_URL=postgresql://user:pass@localhost:5432/kartfiler
DATABASE_URL_UNPOOLED=postgresql://user:pass@localhost:5432/kartfiler
STORAGE_BACKEND=local
STORAGE_ROOT=./storage
```

Kör `npm run db:seed` för att skapa/uppdatera admin-kontot.

## Deploy (produktion)

Appen ligger i undermappen `web/` och deployas till **Vercel** med **Neon PostgreSQL** och **Vercel Blob** för filer.

**Produktions-URL:** [https://web-ebon-eight-72.vercel.app](https://web-ebon-eight-72.vercel.app)  
**Måldomän:** [kartor.ifkmora.se](https://kartor.ifkmora.se) (DNS ännu inte konfigurerad)

### Förutsättningar

- [Vercel-konto](https://vercel.com) och [Vercel CLI](https://vercel.com/docs/cli) (`npm i -g vercel` eller `npx vercel`)
- **Neon PostgreSQL** — koppla via Vercel Marketplace (sätter `DATABASE_URL` och `DATABASE_URL_UNPOOLED`) eller manuellt i Neon-konsolen
- **Vercel Blob** — koppla lagring till projektet (sätter `BLOB_READ_WRITE_TOKEN`)
- Domän `kartor.ifkmora.se` med DNS-åtkomst (valfritt tills DNS är på plats)

### Lokal utveckling vs produktion

| | Lokal utveckling | Produktion (Vercel) |
|---|------------------|---------------------|
| Databas | PostgreSQL lokalt eller Neon dev-branch | Neon PostgreSQL (pooled + direct URL) |
| Fillagring | `STORAGE_BACKEND=local`, filer i `./storage/` | `STORAGE_BACKEND=blob`, Vercel Blob |
| App-URL | `http://localhost:3000` | `https://kartor.ifkmora.se` eller Vercel-URL |
| Migrationer | `npm run db:migrate` (interaktiv) | `prisma migrate deploy` körs automatiskt vid build |
| Seed | `npm run db:seed` lokalt | Kör manuellt en gång efter första deploy (se nedan) |
| SMTP | `.env` eller `/admin/settings` | `/admin/settings` (rekommenderas) eller `.env` |

Build-kommandot på Vercel kör: `prisma generate` → `prisma migrate deploy` → `next build` (definierat i `package.json`).

### Miljövariabler (Vercel Production)

Sätt under **Project → Settings → Environment Variables** (Production). Använd samma värde för `AUTH_URL` och `NEXT_PUBLIC_APP_URL`.

**Viktigt för e-postlänkar:** Notiser (registrering, uppladdning, checkout) bygger länkar från `NEXT_PUBLIC_APP_URL` → `AUTH_URL` → Vercel-URL (`VERCEL_URL`). Om de två första saknas eller fortfarande pekar på `http://localhost:3000` används Vercel-URL automatiskt — men sätt uttryckligen produktions-URL för stabila länkar (särskilt vid egen domän).

Exempel för nuvarande Vercel-deploy:

```
NEXT_PUBLIC_APP_URL=https://web-ebon-eight-72.vercel.app
AUTH_URL=https://web-ebon-eight-72.vercel.app
```

**Obligatoriska:**

| Variabel | Beskrivning |
|----------|-------------|
| `AUTH_SECRET` | Slumpsträng, t.ex. `openssl rand -base64 32` |
| `AUTH_URL` | Publik app-URL, t.ex. `https://web-ebon-eight-72.vercel.app` eller egen domän |
| `NEXT_PUBLIC_APP_URL` | Samma som `AUTH_URL` (krävs för korrekta länkar i e-post) |
| `DATABASE_URL` | Neon pooled connection string (för appen) |
| `DATABASE_URL_UNPOOLED` | Neon direct connection string (för Prisma migrate) |
| `STORAGE_BACKEND` | `blob` |
| `BLOB_READ_WRITE_TOKEN` | Sätts automatiskt när Vercel Blob kopplas |
| `INITIAL_ADMIN_EMAIL` | E-post för första admin-kontot |
| `INITIAL_ADMIN_PASSWORD` | Lösenord för första admin (används vid seed) |

**Valfria:**

| Variabel | Beskrivning |
|----------|-------------|
| `SMTP_*` | Gmail SMTP — kan istället konfigureras under `/admin/settings` |
| `MAX_UPLOAD_BYTES` | Max filstorlek (standard 100 MB) |
| `DIFF_SPATIAL_TOLERANCE_M` | Tolerans för OCD-jämförelse (standard 2 m) |

### Deploy med Vercel CLI

Använd alltid `npm run deploy` — då körs hjälpkontroll (release notes + hjälptext) automatiskt före deploy.

```bash
cd web
npx vercel link          # första gången — koppla till Vercel-projekt
npm run deploy           # produktion (kör check:help:deploy först)
npm run deploy:preview   # förhandsmiljö
```

Vid app-ändringar under `web/src/` måste minst en hjälpfil uppdateras:

- `web/src/lib/help/release-notes.ts`
- `web/src/components/help-page-content.tsx`

Samma kontroll körs vid commit (pre-commit-hook) och vid Vercel-build (git-deploy). Hoppa över i nödfall: `SKIP_HELP_CHECK=1 npm run deploy`.

Vid build appliceras Prisma-migrationer automatiskt. Projektet har tre migrationer (init PostgreSQL, version published, app_settings).

### Databas: migrationer och seed

- **Migrationer** — körs vid varje Vercel-build via `prisma migrate deploy`. Kontrollera build-loggen att alla tre migrationer appliceras utan fel.
- **Seed (första gången)** — skapar admin och valfri exempelkarta. Körs *inte* automatiskt vid deploy:

```bash
cd web
# Sätt DATABASE_URL mot produktion (Neon connection string)
npx prisma db seed
```

Alternativt: kör seed mot prod-DB från en lokal `.env` med produktionens `DATABASE_URL`.

### Domän och DNS

1. I Vercel: **Project → Settings → Domains** → lägg till `kartor.ifkmora.se`
2. Uppdatera DNS hos domänleverantör enligt Vercels instruktioner (vanligtvis `CNAME` mot `cname.vercel-dns.com` eller Vercels nameservers)
3. Uppdatera `AUTH_URL` och `NEXT_PUBLIC_APP_URL` till `https://kartor.ifkmora.se` och redeploya

Tills DNS är konfigurerad fungerar appen via Vercel-URL:en ovan.

### Verifiering efter deploy

1. Öppna produktions-URL → `/login` ska ladda
2. Logga in med admin från seed (`INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD`)
3. Gå till `/admin/settings` — kontrollera SMTP om e-post behövs
4. Ladda upp en testversion av en karta — verifierar Vercel Blob
5. Kör OCD-jämförelse — verifierar att API-routes fungerar (max 300 s timeout på Vercel)

Vid problem: kontrollera Vercel **Deployments → Build logs** (migrationer) och **Functions → Logs** (runtime).

## E-postnotiser (Gmail)

När någon registrerar sig själv får admin en e-post med länk till `/admin/users` för godkännande. E-post skickas bara om SMTP är konfigurerat; annars loggas en varning och registreringen fungerar ändå.

### Konfiguration via admin (rekommenderas)

Inloggad administratör kan konfigurera SMTP under **[Inställningar](/admin/settings)**:

1. Logga in som admin och gå till **Admin → Inställningar**
2. Fyll i Gmail-adress, app-lösenord och admin-notis e-post
3. Aktivera **Aktivera e-post via databasinställningar**
4. Spara och testa med **Skicka testmail**

Lösenordet krypteras i databasen med `AUTH_SECRET` och returneras aldrig i klartext till webbläsaren (fältet visar `••••••••` när ett lösenord redan är sparat).

### Reserv via .env

Om databasinställningar är inaktiva eller tomma används `.env` i stället. Det är användbart vid första uppstart innan admin har konfigurerat SMTP i gränssnittet, eller som produktionsöverstyrning.

### Gmail App Password

Gmail kräver ett **App Password** (inte ditt vanliga lösenord) om tvåfaktorsautentisering (2FA) är aktiverat.

1. Gå till [Google-konto → Säkerhet](https://myaccount.google.com/security)
2. Aktivera **2-stegsverifiering** om den inte redan är på
3. Sök efter **App passwords** / **Applösenord** (under 2-stegsverifiering)
4. Skapa ett nytt applösenord för t.ex. "Mail" / "Other (IFK Mora)"
5. Kopiera det 16-tecken långa lösenordet (inga mellanslag)

Sätt i `.env`:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=ditt@gmail.com
SMTP_PASS=xxxx xxxx xxxx xxxx
# Valfritt — standard är INITIAL_ADMIN_EMAIL
# ADMIN_NOTIFICATION_EMAIL=admin@example.com
```

`SMTP_USER` ska vara samma Gmail-adress som skickar mailet. Mottagare är `ADMIN_NOTIFICATION_EMAIL` eller annars `INITIAL_ADMIN_EMAIL`.

### Skräppost i Gmail

Mailet kan hamna i skräppost trots att SMTP fungerar, särskilt med personlig Gmail. Prova:

1. Markera mailet som **Inte skräppost** i Gmail
2. Lägg till avsändaren i dina kontakter
3. För produktion på **kartor.ifkmora.se**: överväg **Google Workspace** med egen domän och korrekt SPF/DKIM — personlig Gmail kan alltid ge viss skräppostrisk

Avsändaren visas som «IFK Mora Kartor» men måste matcha `SMTP_USER` (Gmail-krav).

## Roller

| Roll | Rättigheter |
|------|-------------|
| Reader | Ladda ner kartfiler |
| Editor | Ladda upp + ladda ner |
| Admin | Skapa kartfiler + användare + allt ovan |

## Kartfiler

Dashboard på `/` visar alla kartfiler. Admin skapar nya kartfiler; redaktörer laddar upp nya versioner på kartdetaljsidan.

```bash
npm run db:seed   # skapar admin + exempelkarta från Exempelfil/
```

## PoC-kommandon

```bash
npm run poc:parse
npm run poc:diff
```

## Stack

Next.js · Auth.js (Credentials) · Prisma · ocad2geojson
