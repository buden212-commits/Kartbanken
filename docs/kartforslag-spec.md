# Kartförslag — produktspec (Fas 1)

Status: **Beslut låsta**, Fas 1 under implementation.

## Syfte

Godkända användare kan markera och beskriva terrängändringar på **publicerade** kartversioner utan OCAD. Redaktörer granskar och markerar förslag som införda eller avvisade.

## Beslut (2026-08-05)

| Fråga | Beslut |
|-------|--------|
| Synlighet | Alla godkända användare ser **alla öppna** förslag på området |
| Opublicerade versioner | **Nej** — förslag endast på publicerade versioner |
| Checkout-koppling | **Frivillig** vid införande |
| Livscykel vid ny version | **Arkiveras kvar** med «Gäller version N», status oförändrad |

## MVP (Fas 1)

- Pin (punkt) + obligatorisk kommentar + kategori
- Status: `OPEN`, `IMPLEMENTED`, `REJECTED`
- Lista på områdessidan, skapa via kartvy, granska på detaljsida
- E-post till notismottagare vid nytt förslag
- Orange overlay, skilt från banor (magenta) och checkout

## Datamodell

Se `web/prisma/schema.prisma`: `MapSuggestion`, `MapSuggestionObject`.

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

## UI

- Områdessida: `SuggestionListPanel`
- Skapa: `/maps/[slug]/versions/[id]/suggest`
- Visa/granska: `/maps/[slug]/suggestions/[id]`
- Knapp «Föreslå ändring» i kartvy (publicerade versioner)

## Fas 2 (ej i scope)

- Rektangel/yta, `IN_PROGRESS`, notis till skapare, foto-bilaga
