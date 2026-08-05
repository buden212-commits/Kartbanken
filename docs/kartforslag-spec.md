# Kartförslag — produktspec

Status: **Fas 1 + Fas 2 + Fas 3 implementerade** (2026-08-05).

## Syfte

Godkända användare kan markera och beskriva terrängändringar på **publicerade** kartversioner utan OCAD. Redaktörer granskar och markerar förslag som pågående, införda eller avvisade.

## Beslut (2026-08-05)

| Fråga | Beslut |
|-------|--------|
| Synlighet | Alla godkända användare ser **alla öppna** förslag på området |
| Opublicerade versioner | **Nej** — förslag endast på publicerade versioner |
| Checkout-koppling | **Frivillig** vid införande |
| Livscykel vid ny version | **Arkiveras kvar** med «Gäller version N», status oförändrad |

## Fas 1 (MVP)

- Pin (punkt) + obligatorisk kommentar + kategori
- Status: `OPEN`, `IMPLEMENTED`, `REJECTED`
- Lista på områdessidan, skapa via kartvy, granska på detaljsida
- E-post till notismottagare vid nytt förslag
- Orange overlay, skilt från banor (magenta) och checkout

## Fas 2

- Rektangel/yta som alternativ till pin vid skapande
- Status `IN_PROGRESS` (pågår) mellan öppen och införd
- E-post till skapare vid granskning (respekterar notisinställning)
- Frivillig foto-bilaga (Vercel Blob)
- Checkout- och versionskoppling i granskningsformuläret
- «Gäller version N» när förslaget gäller äldre publicerad version

## Fas 3

- Polygon- och linjeverktyg vid skapande (utöver punkt och rektangel)
- Objekttyper `POLYGON` och `LINE`; geometrityper `Polygon` (ring) och `LineString`
- Öppna och pågående förslag visas som orange overlay på kartvy och områdessidan (senaste publicerade version)
- Klick på overlay → detaljsida; växla visa/dölj kartförslag-lager (standard på)
- Stora foto (>4,5 MB) via upload-init + Blob client upload (samma mönster som checkin)
- Ägare kan redigera egna öppna förslag (kategori, rubrik, kommentar, markering)

## Datamodell

Se `web/prisma/schema.prisma`: `MapSuggestion`, `MapSuggestionObject`.

Fält: `attachmentPath`, `checkoutId`, `integratedVersionId`, objekttyper `POINT`, `BBOX`, `POLYGON` och `LINE`.

## Behörigheter

| Åtgärd | Läsare | Redaktör | Admin |
|--------|--------|----------|-------|
| Skapa | ✓ | ✓ | ✓ |
| Se alla (publicerade versioner) | ✓ | ✓ | ✓ |
| Redigera eget (OPEN) | ✓ | ✓ | ✓ |
| Granska (status) | ✗ | ✓ | ✓ |
| Radera andras | ✗ | ✗ | ✓ |

## API

- `GET/POST /api/maps/[slug]/suggestions` — `?overlay=1&mapVersionId=` för lättvikts-overlay
- `GET/PATCH/DELETE /api/maps/[slug]/suggestions/[id]`
- `GET /api/maps/[slug]/suggestions/[id]/attachment` — foto
- `POST /api/maps/[slug]/suggestions/attachment/upload-init` + `upload-complete` — stora bilder

## UI

- Områdessida: `SuggestionListPanel` + kartöversikt med förslag (senaste publicerade version)
- Skapa: `/maps/[slug]/versions/[id]/suggest` (punkt, rektangel, polygon eller linje)
- Visa/granska/redigera: `/maps/[slug]/suggestions/[id]`
- Knapp «Föreslå ändring» i kartvy; kartförslag-lager i versionskarta

## Kända begränsningar

- Ingen mini-OCAD, IOF-symboler, multi-objekt eller GPS i kartförslag
