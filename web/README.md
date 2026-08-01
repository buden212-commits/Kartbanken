# kartor.ifkmora.se — webbapp

Webbapp för versionshantering och OCD-jämförelse av orienteringskartor (IFK Mora).

## Kom igång

```bash
cd web
npm install
npm run db:migrate
npm run db:seed    # skapar admin från .env
npm run dev
```

Öppna [http://localhost:3000/login](http://localhost:3000/login).

## Inloggning (e-post + lösenord)

Google-inloggning är pausad. Admin skapar konton manuellt under `/admin/users`.

Sätt i `.env`:

```env
AUTH_SECRET=generera-med-openssl-rand-base64-32
AUTH_URL=http://localhost:3000
INITIAL_ADMIN_EMAIL=buud212@gmail.com
INITIAL_ADMIN_PASSWORD=ditt-admin-lösenord
DATABASE_URL="file:./dev.db"
```

Kör `npm run db:seed` för att skapa/uppdatera admin-kontot.

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
