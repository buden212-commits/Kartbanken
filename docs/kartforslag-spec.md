# Kartförslag — produktspec

Status: **Fas 1 + Fas 2 implementerade** (2026-08-05).

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

## Datamodell

Se `web/prisma/schema.prisma`: `MapSuggestion`, `MapSuggestionObject`.

Fält: `attachmentPath`, `checkoutId`, `integratedVersionId`, objekttyper `POINT` och `BBOX`.

## Behörigheter

| Åtgärd | Läsare | Redaktör | Admin |
|--------|--------|----------|-------|
| Skapa | ✓ | ✓ | ✓ |
| Se alla (publicerade versioner) | ✓ | ✓ | ✓ |
| Redigera eget (OPEN) | ✓ | ✓ | ✓ |
| Granska (status) | ✗ | ✓ | ✓ |
| Radera andras | ✗ | ✗ | ✓ |

## API

- `GET/POST /api/maps/[slug]/suggestions`
- `GET/PATCH/DELETE /api/maps/[slug]/suggestions/[id]`
- `GET /api/maps/[slug]/suggestions/[id]/attachment` — foto

## UI

- Områdessida: `SuggestionListPanel`
- Skapa: `/maps/[slug]/versions/[id]/suggest` (pin eller rektangel)
- Visa/granska: `/maps/[slug]/suggestions/[id]`
- Knapp «Föreslå ändring» i kartvy (publicerade versioner)

## Kända begränsningar

- Foto-uppladdning >4,5 MB via direkt FormData — större filer kräver framtida upload-init-flöde (som checkin).
