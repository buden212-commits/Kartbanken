/** Mermaid-diagram för hjälpsidans process-scheman. */

export const overviewSystem = `
flowchart TB
  subgraph core ["Versionshantering"]
    A[Logga in] --> B[Välj område]
    B --> C[Ladda upp .ocd]
    C --> D[Jämför diff]
    D --> E[Publicera]
    E --> F[Läsare ser kartan]
  end

  subgraph parallel ["Parallella flöden"]
    B --> G[Checka ut / in]
    B --> H[Lägg bana]
    F --> I[Kartförslag]
    B --> J[Verifiera filer]
  end
`;

export const accountRegistration = `
flowchart TD
  U[Oregistrerad användare] --> R[Skapa konto på inloggningssidan]
  R --> W[Väntar på godkännande]
  W --> A{Administratör granskar}
  A -->|Godkänner| OK[Tilldelad roll: läsare, redaktör eller admin]
  A -->|Avvisar| N[Ingen åtkomst]
  OK --> E[E-post med behörighet och inloggningslänk]
  E --> L[Logga in och använd systemet]
`;

export const loginFlow = `
flowchart TD
  S[Ange e-post och lösenord] --> V{Konto godkänt?}
  V -->|Nej, väntar| P[Sida: väntar på godkännande]
  V -->|Nej, avvisat| P
  V -->|Ja| T{Tillfälligt lösenord?}
  T -->|Ja| C[Byt lösenord]
  C --> H[Startsidan / callback]
  T -->|Nej| H
`;

export const passwordReset = `
flowchart LR
  A[Glömt lösenord?] --> B[Ange e-post]
  B --> C[Tillfälligt lösenord skickas]
  C --> D[Logga in]
  D --> E[Byt till eget lösenord]
  E --> F[Klar — full åtkomst]
`;

export const areaManagement = `
flowchart TD
  subgraph all ["Alla godkända"]
    L[Startsidan — lista områden] --> O[Öppna område]
  end

  subgraph admin ["Endast administratör"]
    L --> N[Skapa nytt kartområde]
    O --> E[Redigera visningsnamn]
    O --> X[Radera område permanent]
    N --> U[Första version laddas upp på områdessidan]
  end
`;

export const versionUpload = `
flowchart TD
  O[Öppna område] --> W{Aktiva checkouts?}
  W -->|Ja| V[Varning visas]
  V --> U
  W -->|Nej| U[Välj .ocd-fil och kommentar]
  U --> P[Uppladdning och parsning]
  P --> N[Ny opublicerad version skapas]
  N --> D[Automatisk diff mot föregående]
  D --> M[E-post till prenumeranter]
  M --> R[Granska i jämförelsevy]
`;

export const publishFlow = `
flowchart TD
  V[Version i historiken] --> C{Kryssa i Publicerad?}
  C -->|Ja| P[Denna version blir synlig för läsare]
  P --> U[Tidigare publicerad version avpubliceras automatiskt]
  C -->|Nej| H[Version dold för läsare]
  U --> E[Endast en publicerad version per område]
`;

export const compareFlow = `
flowchart TD
  S[Välj två versioner] --> B[Diff beräknas]
  B --> K[Kartlager: tillagda, borttagna, ändrade]
  K --> L[Ändringslista med filter och sök]
  L --> Z[Zoom till objekt på kartan]

  subgraph entry ["Vägar in"]
    E1[Efter uppladdning]
    E2[Jämför-knapp i historiken]
    E3[Jämför senaste två]
  end
  E1 --> S
  E2 --> S
  E3 --> S
`;

export const checkoutFlow = `
stateDiagram-v2
  direction LR
  [*] --> ACTIVE: Checka ut område
  ACTIVE --> CHECKED_IN: Ladda upp redigerad .ocd
  CHECKED_IN --> PENDING_ADMIN: Användaren bekräftar diff
  PENDING_ADMIN --> INTEGRATED: Admin integrerar
  INTEGRATED --> [*]: Ny kartversion skapas
  ACTIVE --> CANCELLED: Admin avbryter
  CANCELLED --> [*]
`;

export const checkoutSteps = `
flowchart TD
  A[Checka ut område] --> B[Rita rektangel eller polygon]
  B --> C[Ladda ner utcheckning .ocd]
  C --> D[Redigera i OCAD]
  D --> E[Checka in fil]
  E --> F[Granska utcheckningsdiff]
  F --> G[Bekräfta integration]
  G --> H[Admin granskar och integrerar]
  H --> I[Ny version i området]
`;

export const courseFlow = `
flowchart TD
  A[Lägg bana på områdessidan] --> B[Välj IOF-symbol och verktyg]
  B --> C[Rita start, kontroller och mål]
  C --> D[Spara med namn]
  D --> E{Gör publik?}
  E -->|Ja| F[Alla kan öppna]
  E -->|Nej| G[Endast du ser banan]
  D --> H[Valfritt: skuggbana eller PDF-export]
`;

export const suggestionFlow = `
stateDiagram-v2
  direction LR
  [*] --> OPEN: Skicka in kartförslag
  OPEN --> IN_PROGRESS: Redaktör markerar Pågår
  OPEN --> IMPLEMENTED: Redaktör markerar Införd
  OPEN --> REJECTED: Redaktör markerar Avvisad
  IN_PROGRESS --> IMPLEMENTED
  IN_PROGRESS --> REJECTED
  OPEN --> OPEN: Skapare redigerar eget förslag
  IMPLEMENTED --> [*]
  REJECTED --> [*]
`;

export const suggestionSubmit = `
flowchart TD
  A[Öppna publicerad version] --> B[Föreslå ändring]
  B --> C[Rita markering eller GPS-spår]
  C --> D[Lägg till flera ändringar]
  D --> E[Skicka in — kategori och beskrivning]
  E --> F[Förslag syns på karta och i lista]
  F --> G[Redaktör granskar status]
`;

export const verifyFlow = `
flowchart TD
  A[Öppna Verifiera] --> B[Välj två .ocd-filer]
  B --> C[Tillfällig jämförelse körs]
  C --> D[Samma diff-vy som versionsjämförelse]
  D --> E[Inget sparas i systemet]
`;

export const mapViewExport = `
flowchart TD
  A[Klicka versionsrad eller Visa karta] --> B[Interaktiv kartvy]
  B --> C[Zoom, panorera, lager]
  B --> D[Min position GPS]
  B --> E[Visa kartförslag-lager]
  B --> F[Exportera utsnitt]
  F --> G{Välj format}
  G --> H[PDF]
  G --> I[OCAD .ocd]
  G --> J[GeoTIFF .tif]
  B --> K[Öppna i nytt fönster]
`;

export const adminUserFlow = `
flowchart TD
  A[Admin — Användare] --> B{Åtgärd}
  B --> C[Godkänn väntande konto]
  B --> D[Avvisa konto]
  B --> E[Skapa konto manuellt]
  B --> F[Redigera roll och notiser]
  C --> G[E-post till användaren]
`;

export const adminSystemFlow = `
flowchart LR
  subgraph tabs ["Admin-flikar"]
    U[Användare]
    L[Lagring]
    G[Loggning]
    S[Inställningar SMTP]
  end
  U --> UA[Godkänn konton och roller]
  L --> LA[MB per område och trend]
  G --> GA[Auditlogg och e-postspår]
  S --> SA[Testmail och notiser]
`;

export const notificationFlow = `
flowchart TD
  E[Händelse i systemet] --> S{SMTP konfigurerat?}
  S -->|Nej| X[Ingen e-post]
  S -->|Ja| M[Välj mottagare]
  M --> N[Admin / prenumeranter / skapare]
  N --> P{Användaren har notiser på?}
  P -->|Ja| T[Skicka e-post]
  P -->|Nej| X
  T --> B[Valfri .ocd-bilaga]
`;

export const roleHierarchy = `
flowchart BT
  R[Läsare — publicerade versioner, banor, kartförslag]
  E[Redaktör — + uppladdning, publicering, checkout]
  A[Administratör — + områden, användare, integration]
  R --> E
  E --> A
`;
