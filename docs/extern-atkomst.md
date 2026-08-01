# Extern åtkomst — installationsguide

Den här guiden beskriver hur du gör **kartor.ifkmora.se** (OCAD-kartfilshanteraren) tillgänglig utanför ditt lokala nätverk.

> **Domän (mål):** `kartor.ifkmora.se`  
> **App:** Next.js i mappen `web/`  
> **Nuvarande implementation:** SQLite-databas + fillagring på disk (`STORAGE_ROOT`)

---

## Översikt — tre sätt att nå appen externt

| Alternativ | Svårighetsgrad | Passar när |
|------------|----------------|------------|
| **[A. Egen server (VPS)](#a-egen-server-rekommenderat)** | Medel | Permanent drift i produktion |
| **[B. Cloudflare Tunnel](#b-cloudflare-tunnel-snabb-test)** | Lätt | Snabb test/demo från din dator |
| **[C. Vercel + molntjänster](#c-vercel--molntjänster-framtida-produktion)** | Hög | Kräver migrering (ej klart i nuvarande kod) |

**Rekommendation idag:** Alternativ **A** (egen Linux-server) matchar hur appen är byggd just nu — filer och databas lagras lokalt på servern.

---

## Förutsättningar (alla alternativ)

- **Node.js 20+** ([nodejs.org](https://nodejs.org/))
- **Git** (för att klona repot)
- **Domän** `kartor.ifkmora.se` med tillgång till DNS-inställningar
- **HTTPS** — obligatoriskt för inloggning (Auth.js kräver säkra cookies i produktion)

### Miljövariabler (produktion)

Kopiera `web/.env.example` till `web/.env` och fyll i:

```env
# Auth — generera med: openssl rand -base64 32
AUTH_SECRET=<slumpmässig-hemlig-sträng>
AUTH_URL=https://kartor.ifkmora.se

# Admin vid första start (rotera lösenord efter deploy!)
INITIAL_ADMIN_EMAIL=buud212@gmail.com
INITIAL_ADMIN_PASSWORD=<starkt-lösenord>

# Databas (SQLite på egen server)
DATABASE_URL="file:./prod.db"

# App
NEXT_PUBLIC_APP_URL=https://kartor.ifkmora.se
MAX_UPLOAD_BYTES=104857600
STORAGE_ROOT=/var/kartor/storage
DIFF_SPATIAL_TOLERANCE_M=2
```

> **Viktigt:** Spara aldrig `.env` i git. Använd starka lösenord och rotera `INITIAL_ADMIN_PASSWORD` efter att admin-kontot skapats.

---

## A. Egen server (rekommenderat)

Permanent drift på en VPS (t.ex. Hetzner, DigitalOcean, Linode) eller en egen Linux-maskin med publik IP.

### A.1 Serverkrav

| Resurs | Minimum | Rekommenderat |
|--------|---------|---------------|
| RAM | 1 GB | 2 GB+ |
| Disk | 20 GB | 50 GB+ (kartfiler kan bli stora) |
| OS | Ubuntu 22.04/24.04 LTS | Ubuntu 24.04 LTS |
| Portar | 80, 443 (öppna i brandvägg) | SSH endast från din IP |

### A.2 Installera på servern

```bash
# 1. Uppdatera systemet
sudo apt update && sudo apt upgrade -y

# 2. Installera Node.js 20 (via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git

# 3. Klona repot
git clone <din-repo-url> /opt/kartor
cd /opt/kartor/web

# 4. Skapa lagringsmapp och databasmapp
sudo mkdir -p /var/kartor/storage
sudo chown -R $USER:$USER /var/kartor

# 5. Skapa .env (se avsnitt ovan)
nano .env

# 6. Installera och bygg
npm install
npm run db:migrate
npm run db:seed
npm run build
```

### A.3 Kör appen med systemd (startar om automatiskt)

Skapa `/etc/systemd/system/kartor.service`:

```ini
[Unit]
Description=Kartor IFK Mora webbapp
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/kartor/web
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run start
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo chown -R www-data:www-data /opt/kartor/web /var/kartor
sudo systemctl daemon-reload
sudo systemctl enable kartor
sudo systemctl start kartor
sudo systemctl status kartor
```

Appen lyssnar på **port 3000** internt.

### A.4 HTTPS med Caddy (reverse proxy)

Installera [Caddy](https://caddyserver.com/) — hanterar Let's Encrypt-certifikat automatiskt:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy
```

Skapa `/etc/caddy/Caddyfile`:

```
kartor.ifkmora.se {
    reverse_proxy localhost:3000
}
```

```bash
sudo systemctl reload caddy
```

### A.5 DNS

Lägg till hos din domänleverantör (t.ex. Loopia, Cloudflare, One.com):

| Typ | Namn | Värde |
|-----|------|-------|
| **A** | `kartor` | `<serverns publika IP>` |

Eller om du använder Cloudflare proxy: peka CNAME/A till servern och aktivera proxy (orange moln).

Vänta på DNS-propagering (ofta 5–30 min, ibland upp till 24 h).

### A.6 Verifiera

1. Öppna `https://kartor.ifkmora.se/login`
2. Logga in med admin-kontot (`INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD`)
3. Skapa ett testkonto under `/admin/users`
4. Testa uppladdning av en `.ocd`-fil (kräver Editor- eller Admin-roll)

### A.7 Backup (obligatoriskt)

Säkerhetskopiera regelbundet:

```bash
# Databas
cp /opt/kartor/web/prisma/prod.db /backup/kartor-$(date +%F).db

# Uppladdade kartfiler
rsync -a /var/kartor/storage/ /backup/kartor-storage/
```

Schemalägg med cron (t.ex. dagligen kl. 03:00).

### A.8 Uppdatera appen

```bash
cd /opt/kartor
git pull
cd web
npm install
npm run db:migrate
npm run build
sudo systemctl restart kartor
```

---

## B. Cloudflare Tunnel (snabb test)

Exponera appen från **din Windows-dator** utan att öppna portar i routern. Bra för test innan permanent server.

### B.1 Förbered lokalt

```powershell
cd C:\Users\jonas\Kartfiler\web
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Appen körs på `http://localhost:3000`.

### B.2 Installera cloudflared

1. Ladda ner [cloudflared för Windows](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
2. Logga in: `cloudflared tunnel login`
3. Skapa tunnel: `cloudflared tunnel create kartor-dev`
4. Konfigurera `config.yml`:

```yaml
tunnel: <tunnel-id>
credentials-file: C:\Users\<användare>\.cloudflared\<tunnel-id>.json

ingress:
  - hostname: kartor.ifkmora.se
    service: http://localhost:3000
  - service: http_status:404
```

5. Lägg till DNS-post (Cloudflare visar kommandot):  
   `cloudflared tunnel route dns kartor-dev kartor.ifkmora.se`

6. Starta: `cloudflared tunnel run kartor-dev`

### B.3 Miljövariabler för tunnel

I `.env`:

```env
AUTH_URL=https://kartor.ifkmora.se
NEXT_PUBLIC_APP_URL=https://kartor.ifkmora.se
```

> **Obs:** Datorn måste vara påslagen och `npm run dev` (eller `npm run start`) måste köra. Tunneln är **inte** lämplig för permanent produktion.

---

## C. Vercel + molntjänster (framtida produktion)

Enligt [prd.md](../prd.md) är målarkitekturen:

- **Hosting:** Vercel
- **Databas:** PostgreSQL (Neon eller Supabase)
- **Fillagring:** Cloudflare R2

**Detta är inte fullt implementerat i nuvarande kod.** Appen använder SQLite och lokal disk (`STORAGE_ROOT`), vilket **inte fungerar** på Vercel (stateless, ephemeral filsystem).

### Vad som krävs innan Vercel-deploy

1. Byt Prisma `provider` från `sqlite` till `postgresql`
2. Implementera R2-lagring i `src/lib/storage.ts` (ersätt filsystem)
3. (Rekommenderat) Presigned upload direkt till R2 — undvik Vercels body-limit
4. Sätt alla miljövariabler i Vercel Dashboard

### När det är klart — Vercel-steg

```bash
cd web
npx vercel login
npx vercel --prod
```

I Vercel Dashboard → **Settings → Domains** → lägg till `kartor.ifkmora.se`.

DNS hos domänleverantör:

| Typ | Namn | Värde |
|-----|------|-------|
| **CNAME** | `kartor` | `cname.vercel-dns.com` |

Kör `npx prisma migrate deploy` som del av deploy-pipeline.

---

## Säkerhet — checklista före extern lansering

- [ ] HTTPS aktivt (Caddy, Cloudflare eller Vercel hanterar certifikat)
- [ ] `AUTH_SECRET` är unik och minst 32 tecken
- [ ] Admin-lösenord roterat efter första inloggning
- [ ] `.env` finns inte i git eller publika platser
- [ ] Brandvägg: endast port 80/443 (och SSH) öppna
- [ ] Backup-rutin på plats för databas + `storage/`
- [ ] Endast admin skapar användarkonton (`/admin/users`)
- [ ] (Valfritt) Begränsa SSH till din IP

---

## Felsökning

### "Invalid CSRF" eller inloggning fungerar inte

- Kontrollera att `AUTH_URL` och `NEXT_PUBLIC_APP_URL` matchar den URL användaren besöker (inkl. `https://`).
- Starta om appen efter `.env`-ändringar.

### Uppladdning misslyckas / fil för stor

- Servern måste tillåta request body upp till 100 MB.
- Caddy/nginx: standardgräns räcker oftast; Next.js är konfigurerad för 100 MB i `next.config.ts`.
- På Vercel krävs annan upload-strategi (presigned R2).

### Sidan laddar men kartfiler saknas efter omstart

- Kontrollera att `STORAGE_ROOT` pekar på persistent disk (inte `/tmp`).
- På Vercel: lokal lagring fungerar inte — använd egen server eller R2.

### DNS pekar rätt men sidan når inte servern

```bash
# Kontrollera DNS
nslookup kartor.ifkmora.se

# Kontrollera att appen lyssnar
curl -I http://localhost:3000

# Kontrollera Caddy
sudo caddy validate --config /etc/caddy/Caddyfile
sudo journalctl -u kartor -f
```

---

## Snabbreferens — kommandon

| Syfte | Kommando |
|-------|----------|
| Lokal utveckling | `cd web && npm run dev` |
| Produktionsbygge | `cd web && npm run build && npm run start` |
| Skapa admin | `npm run db:seed` |
| Databasmigration | `npm run db:migrate` |
| Status (systemd) | `sudo systemctl status kartor` |
| Loggar | `sudo journalctl -u kartor -f` |

---

## Relaterade dokument

- [prd.md](../prd.md) — produktkrav och målarkitektur
- [mvp-tickets.md](./mvp-tickets.md) — implementationstickets inkl. E8 Deploy & drift
- [web/README.md](../web/README.md) — lokal utvecklingsstart
