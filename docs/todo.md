# Att göra senare

Parkerad 2026-08-14. Bygg inte förrän frågorna under varje punkt är besvarade.

## 1. Kartförslag → OCD / utcheckning

Redaktör ska kunna gå från valda kartförslag till något som går att redigera i OCAD (utcheckning och/eller ny version), i stället för att bara exportera markeringar.

**Öppna frågor**

- Resultat: ny utcheckning, direkt ny kartversion, eller båda (välj i dialogen)?
- Urval: valda förslag, alla öppna på versionen, eller alla tilldelade dig?
- Ska införda förslag automatiskt bli Införd, eller först när admin publicerat/integrerat?
- Raderingsmarkeringar («Punkt radera»): hoppa över (som vid OCD-export idag), eller skapa markering i OCAD?

## 2. Fältläge / offline-ish för kartförslag — gjort 2026-08-18

Spara utkast när mottagning är dålig och synka när nätet kommer tillbaka.

**Beslut**

- PWA (installera på hemskärmen) + utkast i IndexedDB
- Hela pågående förslaget inkl. foto (skapa och redigera egna öppna)
- Konflikt: senaste vinner, tyst (clientDraftId + lås)
- Autosynk när nätet kommer tillbaka, plus manuell Skicka/Spara
- Installera-fråga i mobilläge vid uppstart om appen inte är installerad

## 3. Tilldela / äga kartförslag

Göra granskningskön mer operativ: någon tar/äger ett förslag, filter på tilldelad, ev. påminnelse.

**Öppna frågor**

- Vem får tilldela: bara admin, redaktörer, eller själv «Ta den»?
- En ägare per förslag, eller flera?
- Påminnelsemail (t.ex. öppet > 7 dagar), eller räcker filter «Mina» / «Otilldelade»?

## 4. Översikt öppna förslag på områdessidan — gjort 2026-08-19

Visa var underhåll behövs mest: karta och/eller lista sorterad efter ålder/täthet.

**Beslut**

- Karta + lista (befintlig overlay), förbättrad med täthets-sortering i listan
- Synlig för alla inloggade med kartförslag (läsare inkl.)
- Öppen + Pågår (som idag)
- Listan sorteras efter kluster/täthet (förslag inom ca 200 m räknas som samma område); badge «X förslag inom samma område»
