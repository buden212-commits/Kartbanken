import Link from "next/link";
import type { ReactNode } from "react";
import { auth } from "@/auth";
import { HelpReleaseNotes } from "@/components/help-release-notes";
import { canAdmin, canUpload, roleLabel } from "@/lib/auth/permissions";

const sections = [
  { id: "oversikt", label: "Översikt" },
  { id: "kom-igang", label: "Kom igång" },
  { id: "roller", label: "Roller och behörigheter" },
  { id: "omraden", label: "Områden" },
  { id: "versioner", label: "Versionshantering" },
  { id: "checkout", label: "Checka ut och in" },
  { id: "bana", label: "Lägg bana" },
  { id: "kartforslag", label: "Kartförslag" },
  { id: "publicering", label: "Publicering" },
  { id: "jamfor", label: "Jämföra versioner" },
  { id: "verifiera", label: "Verifiera" },
  { id: "kartvy", label: "Visa karta och export" },
  { id: "admin", label: "Administration", adminOnly: true },
  { id: "release-notes", label: "Release notes" },
  { id: "faq", label: "Vanliga frågor" },
] as const;

function HelpSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
      <div className="mt-4 space-y-4 text-sm leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}

function HelpList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export async function HelpPageContent() {
  const session = await auth();
  const role = session?.user.role;
  const showAdmin = !!(role && canAdmin(role));
  const showEditor = !!(role && canUpload(role));

  const visibleSections = sections.filter((s) => !("adminOnly" in s && s.adminOnly) || showAdmin);

  return (
    <div className="grid gap-10 lg:grid-cols-[220px_1fr] lg:gap-12">
      <nav className="lg:sticky lg:top-24 lg:self-start">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Innehåll</p>
        <ul className="mt-3 space-y-1 text-sm">
          {visibleSections.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="block rounded-md px-2 py-1.5 text-slate-600 transition hover:bg-ifk-blue-pale hover:text-ifk-blue"
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-12">
        <HelpSection id="oversikt" title="Översikt">
          <p>
            <strong>kartor.ifkmora.se</strong> är IFK Mora OK:s system för versionshantering och
            jämförelse av orienteringskartor i OCAD-format (.ocd). Du kan ladda upp nya versioner,
            granska skillnader mellan versioner, visa kartor i webbläsaren, exportera utsnitt som
            PDF eller OCAD, planera banor direkt på kartan, och — som redaktör — checka ut
            delområden för parallell redigering i OCAD.
          </p>
          <p>Huvudflödet för versionshantering ser ut så här:</p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>Logga in och välj ett område på startsidan.</li>
            <li>Ladda upp en ny .ocd-fil som skapar en ny version.</li>
            <li>Granska diff mot föregående version.</li>
            <li>Publicera versionen när den ska vara tillgänglig för läsare.</li>
          </ol>
          <p className="mt-4">Parallell redigering via checkout:</p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>Checka ut ett område på områdessidan och ladda ner utcheckning .ocd.</li>
            <li>Redigera i OCAD och checka in filen.</li>
            <li>Granska diff, bekräfta och låt administratör integrera ändringarna.</li>
          </ol>
          <p className="mt-4">Banplanering:</p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>Öppna Lägg bana på områdessidan.</li>
            <li>Rita start, kontroller och mål med IOF-symboler 701–709.</li>
            <li>Spara banan och exportera som PDF vid behov.</li>
          </ol>
        </HelpSection>

        <HelpSection id="kom-igang" title="Kom igång">
          <h3 className="font-medium text-slate-900">Skapa konto</h3>
          <p>
            Gå till <Link href="/login" className="link-primary">inloggningssidan</Link> och välj
            fliken <strong>Skapa konto</strong>. Fyll i namn, e-post och lösenord (minst 8 tecken).
            Ditt konto får statusen <em>Väntar på godkännande</em> tills en administratör godkänt
            det. Administratören får ett e-postmeddelande om SMTP är konfigurerat.
          </p>

          <h3 className="font-medium text-slate-900">Logga in</h3>
          <p>
            Använd e-post och lösenord på inloggningssidan. Om kontot ännu inte godkänts kan du
            inte logga in — du får meddelandet att kontot väntar på godkännande. Kontakta klubbens
            administratör om det dröjer. När administratören godkänner ditt konto skickas ett
            e-postmeddelande med vilken behörighet du fått och länk till inloggning (kräver
            konfigurerad SMTP).
          </p>

          <h3 className="font-medium text-slate-900">Glömt lösenord</h3>
          <p>
            På inloggningssidan, klicka <strong>Glömt lösenord?</strong> och ange din e-postadress.
            Om adressen finns registrerad skickas ett tillfälligt lösenord som gäller i en timme.
            Logga in med det tillfälliga lösenordet — du omdirigeras då till att välja ett nytt
            eget lösenord innan du kan använda systemet.
          </p>

          <h3 className="font-medium text-slate-900">Min profil</h3>
          <p>
            Klicka på <strong>ditt namn</strong> i sidhuvudet för att öppna profildialogen. Där ser
            du din behörighet (roll), kan styra e-postnotiser och byta lösenord.
          </p>
          <HelpList
            items={[
              "Behörighet — visar din roll (läsare, redaktör eller administratör) och vad den innebär",
              "Notiser — kryssa i e-postnotiser vid nya versioner, checkout och incheckning; valfritt bifoga .ocd",
              "Lösenord — byt lösenord med nuvarande lösenord som bekräftelse",
            ]}
          />

          <h3 className="font-medium text-slate-900">Navigation</h3>
          <HelpList
            items={[
              "Område — startsidan med alla kartområden",
              "Verifiera — tillfällig jämförelse utan uppladdning",
              "Hjälp — den här sidan (inklusive release notes)",
              "Admin — användare, lagring, loggning och inställningar (endast administratörer)",
            ]}
          />
        </HelpSection>

        <HelpSection id="roller" title="Roller och behörigheter">
          <p>Din roll styr vad du kan se och göra i systemet.</p>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
                  <th className="px-4 py-3 font-medium">Roll</th>
                  <th className="px-4 py-3 font-medium">Behörigheter</th>
                </tr>
              </thead>
              <tbody className="text-slate-700">
                <tr className="border-b border-slate-100">
                  <td className="px-4 py-3 font-medium">Läsare</td>
                  <td className="px-4 py-3">
                    Ladda ner, visa och jämföra <strong>publicerade</strong> versioner. Skapa och
                    redigera egna banor (privata som standard)
                  </td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="px-4 py-3 font-medium">Redaktör</td>
                  <td className="px-4 py-3">
                    Allt läsare kan, plus ladda upp versioner, publicera/avpublicera, se
                    opublicerade versioner och checka ut/in områden för OCAD-redigering
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium">Administratör</td>
                  <td className="px-4 py-3">
                    Allt redaktör kan, plus skapa områden, redigera områdesnamn, radera områden,
                    godkänna konton, avbryta checkouts, integrera incheckningar och hantera
                    systeminställningar
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          {role && (
            <p className="rounded-lg border border-ifk-blue/20 bg-ifk-blue-pale px-4 py-3 text-ifk-blue">
              Du är inloggad som <strong>{session?.user.name?.trim() || session?.user.email}</strong>{" "}
              med rollen <strong>{roleLabel(role)}</strong>.
            </p>
          )}
        </HelpSection>

        <HelpSection id="omraden" title="Områden">
          <p>
            Startsidan visar alla kartområden i klubben. Varje rad visar områdesnamn, senaste
            version, uppladdningsdatum, filstorlek och vem som laddade upp. Listan visas först;
            formuläret <strong>Skapa nytt kartområde</strong> finns under listan.
          </p>
          <p>Klicka på ett områdesnamn för att öppna detaljsidan med full versionshistorik.</p>
          {showAdmin && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="font-medium text-slate-900">Administratörer</p>
              <p className="mt-1">
                Skapa nya områden med namn och valfri beskrivning. Ett område är en logisk
                behållare — den första versionen laddas upp på områdets detaljsida. Ändra
                visningsnamnet via ikonen <strong>Redigera namn</strong> bredvid titeln (URL:en
                ändras inte). Radera område via papperskorg-ikonen — detta tar bort alla versioner
                och tillhörande data permanent.
              </p>
            </div>
          )}
        </HelpSection>

        <HelpSection id="versioner" title="Versionshantering">
          <p>
            Varje uppladdning av en .ocd-fil skapar en ny version. Tidigare versioner behålls och
            kan jämföras eller laddas ner.
          </p>
          {showEditor ? (
            <>
              <h3 className="font-medium text-slate-900">Ladda upp ny version</h3>
              <HelpList
                items={[
                  "Öppna området och välj OCAD-fil (.ocd) i uppladdningsformuläret",
                  "Lägg till en valfri kommentar, t.ex. vad som ändrats",
                  "Efter uppladdning jämförs automatiskt mot föregående version",
                  "Nya versioner är opublicerade tills du markerar dem som publicerade",
                  "Prenumeranter får e-post om ny version (om SMTP och notiser är aktiverade)",
                ]}
              />
            </>
          ) : (
            <p>
              Som läsare ser du publicerade versioner. Oppublicerade versioner visas som{" "}
              <em>Ej tillgänglig för läsare</em>.
            </p>
          )}
          <h3 className="font-medium text-slate-900">Åtgärder per version</h3>
          <p>
            I versionshistoriken finns ikonknappar med tooltips för ladda ner, jämföra, publicera
            och radera. Klicka på filnamnet för att öppna kartan.
          </p>
          <HelpList
            items={[
              "Ladda ner — hämta originalfilen (.ocd)",
              "Jämför — diff mot föregående version",
              "Visa karta — klicka på filnamnet eller öppna via ikonmenyn",
              "Öppna i nytt fönster — helskärmsvy utan sidhuvud",
              "Publicera — kryssa i Publicerad (redaktör/admin)",
            ]}
          />
          <h3 className="font-medium text-slate-900">Versionshistorik</h3>
          <p>
            Tabellen visar datum (klockslag i tooltip), filnamn, kommentar och åtgärder. Endast den
            senaste versionen kan vara ihopfälld som standard beroende på vy — expandera för att se
            alla versioner.
          </p>
        </HelpSection>

        <HelpSection id="checkout" title="Checka ut och in">
          <p>
            Checkout låter redaktörer reservera ett delområde på kartan, ladda ner en utcheckning
            .ocd-fil för redigering i OCAD, och sedan checka in ändringarna för granskning och
            integration. Alla inloggade användare ser aktiva checkout-områden som färgade
            överlagringar med vem som checkat ut och när.
          </p>

          {showEditor ? (
            <>
              <h3 className="font-medium text-slate-900">Checka ut område</h3>
              <HelpList
                items={[
                  "Öppna området och klicka Checka ut område (knappen bredvid karttiteln)",
                  "Välj verktyg: rektangel eller polygon",
                  "Rita området på kartan och bekräfta urvalet",
                  "Klicka Checka ut område — du kommer till checkout-detaljsidan",
                  "Ladda ner utcheckning .ocd och redigera i OCAD",
                  "Överlappande checkouts blockeras — vänta tills ett område frigörs",
                ]}
              />

              <h3 className="font-medium text-slate-900">Checka in och integrera</h3>
              <HelpList
                items={[
                  "Ladda upp den redigerade .ocd-filen via Checka in på checkout-sidan",
                  "Granska utcheckningsdiff mot aktuell version (tillagda, borttagna, ändrade)",
                  "Bekräfta integration — checkout går till admin-bekräftelse",
                  "Administratör bekräftar och integrerar — en ny kartversion skapas",
                  "Vid incheckning skickas e-post med .ocd-bilaga till admin och prenumeranter med «Bifoga .ocd»",
                ]}
              />
            </>
          ) : (
            <p>
              Som läsare kan du se aktiva checkout-områden på kartfilens sida, men du kan inte
              skapa egna checkouts. Kontakta en redaktör om du behöver redigera kartor.
            </p>
          )}

          <h3 className="font-medium text-slate-900">Synliga överlagringar</h3>
          <p>
            På områdessidan visas färgade ytor för alla aktiva checkouts. Varje färg motsvarar
            en användare och visar vem som arbetar i området och när checkout skapades. Det hjälper
            teamet undvika parallella ändringar i samma del av kartan.
          </p>

          {showAdmin && (
            <>
              <h3 className="font-medium text-slate-900">Administratör</h3>
              <HelpList
                items={[
                  "Avbryt checkout (tvinga avbryt) med valfri anledning om arbetet behöver stoppas",
                  "Bekräfta och integrera efter att användaren bekräftat diff",
                  "Vid full uppladdning av hel karta varnas du om aktiva checkouts finns",
                ]}
              />
            </>
          )}

          {showEditor && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
              Ladda inte upp en hel karta (.ocd) medan aktiva checkouts pågår om du inte vet vad
              du gör — det kan störa parallellt arbete. Systemet varnar dig innan uppladdningen
              genomförs.
            </p>
          )}

          <h3 className="font-medium text-slate-900">Påminnelser</h3>
          <p>
            Om en checkout är aktiv längre än sju dagar (standard, konfigurerbart av administratör)
            får checkout-ägaren ett påminnelsemail att checka in eller avbryta arbetet.
          </p>
        </HelpSection>

        <HelpSection id="bana" title="Lägg bana">
          <p>
            Med <strong>Lägg bana</strong> planerar du orienteringsbanor direkt ovanpå kartans
            senaste version. Banor sparas separat och påverkar aldrig själva kartfilen — de är
            overlay-lager som kan delas med andra användare.
          </p>
          <p>
            Öppna banredigeraren via knappen <strong>Lägg bana</strong> på områdessidan, eller
            gå direkt till <code className="rounded bg-slate-100 px-1">/maps/[slug]/bana</code>.
          </p>

          <h3 className="font-medium text-slate-900">IOF-symboler 701–709</h3>
          <p>
            Banor ritas med IOF:s banplaneringssymboler (magenta/lila) enligt ISOM. Tillgängliga
            symboler i redigeraren:
          </p>
          <HelpList
            items={[
              "701 Start — triangel (punkt)",
              "703 Kontroll — cirkel (punkt); banlinjer dras automatiskt mellan start, kontroller och mål",
              "704 Kontrollnummer — text; nummer sätts automatiskt vid nya kontroller",
              "705 Banlinje — linje",
              "706 Mål — dubbelcirkel (punkt)",
              "707 Markerad sträcka — streckad linje",
              "709 Förbudsområde — yta med skraffering",
            ]}
          />

          <h3 className="font-medium text-slate-900">Rita och redigera</h3>
          <HelpList
            items={[
              "Välj symbol i panelen till höger och verktyg: Rita, Flytta eller Radera",
              "Punkt — klicka på kartan",
              "Linje — klicka punkter, dubbelklicka eller Avsluta linje",
              "Yta — klicka hörn, dubbelklicka nära start eller Avsluta yta",
              "Text — klicka och skriv i dialogrutan",
              "Flytta — dra valt objekt; vid kontroll (703) följer kontrollnumret (704) med",
              "Flytta kontrollnummer (704) separat via verktyget Flytta eller knappen nr i kontrollistan",
              "Radera — välj objekt och tryck Radera, eller använd verktyget Radera",
            ]}
          />

          <h3 className="font-medium text-slate-900">Kontrollista och banlängd</h3>
          <p>
            Kontrollistan visar start, alla numrerade kontroller och mål i banordning. Banlängd
            beräknas live utifrån banlinjerna mellan start, kontroller och mål, och visas både i
            verktygsraden och i kontrollistan. Klicka på en punkt i listan för att zooma in på den.
          </p>

          <h3 className="font-medium text-slate-900">Spara och dela</h3>
          <HelpList
            items={[
              "Ge banan ett namn och klicka Spara",
              "Nya banor är privata som standard — kryssa i Gör publik för att dela med alla",
              "Privata banor syns bara för dig; publika banor kan öppnas av alla godkända användare",
              "Öppna befintlig bana via listan Öppna bana… eller från banlistan på områdessidan",
              "Ny bana — starta om utan att spara ändringar i aktuell bana",
              "Radera bana — tar bort banan permanent (ägare eller administratör)",
            ]}
          />

          <h3 className="font-medium text-slate-900">Skuggbana</h3>
          <p>
            Välj en annan sparad bana som <strong>skuggbana</strong> i rullgardinsmenyn. Den visas
            halvtransparent ovanpå din aktiva bana så att du kan jämföra två banor visuellt utan att
            ändra någon av dem.
          </p>

          <h3 className="font-medium text-slate-900">PDF-export</h3>
          <p>
            Efter att banan sparats kan du exportera den som PDF längst ned i banredigeraren:
          </p>
          <HelpList
            items={[
              "Välj vilken bana som ska exporteras",
              "Välj pappersformat: A4 eller A3",
              "Välj orientering: stående eller liggande",
              "Välj skala (t.ex. 1:10 000, 1:7 500, 1:5 000)",
              "Utskriftsområdet centreras automatiskt på den valda banans utbredning",
              "PDF roteras +7° enligt IOF-utskriftsstandard",
              "Bannamn och banlängd skrivs ut nederst till vänster i magenta",
            ]}
          />
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700">
            Banor påverkar aldrig kartfilens versioner. Uppdateras kartan laddas banor mot den nya
            aktuella versionen — kontrollera att banan fortfarande stämmer efter större kartändringar.
          </p>

          {!showEditor && (
            <p>
              Som läsare kan du skapa och redigera egna banor, men inte andras privata banor.
              Publika banor kan du öppna och kopiera som underlag för egna banor.
            </p>
          )}
        </HelpSection>

        <HelpSection id="kartforslag" title="Kartförslag">
          <p>
            Med <strong>Kartförslag</strong> kan alla godkända användare markera och beskriva
            terrängändringar på <strong>publicerade</strong> kartversioner — utan att röra
            kartfilen. Förslagen granskas av redaktörer och kan kopplas till checkout vid behov.
          </p>
          <HelpList
            items={[
              "Öppna en publicerad version via Visa karta och klicka Föreslå ändring",
              "Välj punkt, rektangel, polygon eller linje och markera på kartan",
              "Växla «Rita» / «Navigera» ovanför kartan — i Navigera kan du dra och nypa utan att rita; i Rita zoomar två fingrar utan att skapa markering",
              "Klicka «Lägg till ändring» när markeringen är klar — punkt och rektangel aktiveras direkt efter klick/drag",
              "Lägg till flera markeringar — varje markering numreras (1, 2, 3 …) på kartan",
              "Beskrivning och kategori fylls i i formuläret ovanför kartan och gäller hela kartförslaget",
              "Skicka-sektionen ovanför kartan visar antal tillagda ändringar innan du skickar",
              "Öppna och pågående förslag visas på kartan — klicka markeringen eller ett förslag i listan på områdessidan (zoomar kartan till markeringen)",
              "På detaljsidan zoomas kartan automatiskt till markeringen; «Zooma till markering» finns kvar om du vill fokusera om",
              "Växla «Visa kartförslag» i kartvyn för att dölja lagret",
              "Redaktörer markerar som Pågår, Införd eller Avvisad och kan koppla checkout",
              "Vid Pågår, Införd eller Avvisad visas vem som satte statusen och när (detaljsida och lista)",
              "Du kan redigera egna öppna förslag (text och markering) via Redigera på detaljsidan",
              "Förslag gäller den version du markerade — vid ny publicerad version visas «Gäller version N»",
              "Exportera PDF med alla öppna och pågående förslag via knappen i listan (text, foto och kartutklipp per förslag)",
              "Kartutklipp i PDF-rapporten visar minst 200×200 meter med tydligt markerade linjer och punkter",
            ]}
          />
          <p className="rounded-lg border border-[#FD3DB5]/30 bg-[#FD3DB5]/10 px-4 py-3 text-[#9D0066]">
            Kartförslag är <strong>förslag</strong>, inte en del av kartan. Terräng ändras fortfarande
            via checkout och OCAD-redigering.
          </p>
        </HelpSection>

        <HelpSection id="publicering" title="Publicering">
          <p>
            Nya versioner är <strong>opublicerade</strong> som standard. Det innebär att läsare inte
            kan se, ladda ner eller jämföra dem förrän en redaktör eller administratör publicerar
            dem.
          </p>
          {showEditor ? (
            <HelpList
              items={[
                "Kryssa i Publicerad i versionshistoriken för att göra versionen synlig för läsare",
                "Avmarkera för att dölja versionen igen",
                "Publicera först när kartan är granskad och klar att delas",
              ]}
            />
          ) : (
            <p>
              Om du inte ser den senaste versionen kan det bero på att den ännu inte publicerats.
              Kontakta en redaktör i klubben.
            </p>
          )}
        </HelpSection>

        <HelpSection id="jamfor" title="Jämföra versioner">
          <p>
            Jämförelsen visar skillnader mellan två versioner: tillagda, borttagna och ändrade
            kartobjekt. Du når jämförelsen via knappen <strong>Jämför</strong> i
            versionshistoriken, via <strong>Jämför senaste två versioner</strong>, eller automatiskt
            efter uppladdning.
          </p>

          <h3 className="font-medium text-slate-900">Färgkoder</h3>
          <HelpList
            items={[
              "Grön — tillagda objekt",
              "Röd — borttagna objekt",
              "Gul/amber — ändrade objekt",
            ]}
          />

          <h3 className="font-medium text-slate-900">Kartvyer</h3>
          <HelpList
            items={[
              "Hela kartan — senaste versionen",
              "Nya objekt — endast tillagda",
              "Raderade objekt — endast borttagna",
              "Ändrade objekt — endast ändrade",
            ]}
          />
          <p>
            Klicka på kartan eller i ändringslistan för att zooma in på ett objekt och se
            symbolnummer, typ och position.
          </p>

          <h3 className="font-medium text-slate-900">Detaljerade ändringar</h3>
          <p>
            Fliken visar alla ändringar med filter (alla/tillagda/borttagna/ändrade) och sökning på
            symbol, namn eller text. Fliken <strong>Ändringar per symbol</strong> summerar antal
            per symboltyp.
          </p>

          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
            Stora kartfiler kan ta upp till en minut att parsa och jämföra. Sidan uppdateras
            automatiskt när beräkningen är klar.
          </p>
        </HelpSection>

        <HelpSection id="verifiera" title="Verifiera">
          <p>
            Sidan <Link href="/verifiera" className="link-primary">Verifiera</Link> låter dig
            jämföra två .ocd-filer <strong>tillfälligt</strong> utan att spara dem som version i
            systemet. Använd det när du vill kontrollera ändringar innan du laddar upp.
          </p>
          <HelpList
            items={[
              "Välj två OCAD-filer och starta jämförelsen",
              "Samma diff-vy som vid versionsjämförelse: kartlager, ändringslista och per symbol",
              "Filerna sparas inte — inget sparas i versionshistoriken",
              "Export till PDF/OCD finns inte i Verifiera",
            ]}
          />
        </HelpSection>

        <HelpSection id="kartvy" title="Visa karta och export">
          <p>
            <strong>Visa karta</strong> öppnar en interaktiv kartvy med zoom och panorering. Kartan
            autoanpassas till hela kartans utbredning vid öppning (<strong>Hela kartan</strong>).
            Du kan klicka på objekt i jämförelsevyer för att se detaljer.
          </p>

          <h3 className="font-medium text-slate-900">Zoom och navigering</h3>
          <HelpList
            items={[
              "Knapparna + och − zoomar in respektive ut med 50 % per klick",
              "Mushjul zoomar också i 50 %-steg",
              "Maxzoom är 4000 %",
              "Hela kartan — återställer vyn så att hela kartan syns",
              "Dra i kartan för att panorera",
            ]}
          />

          <h3 className="font-medium text-slate-900">Lager</h3>
          <p>
            Under kartan finns panelen <strong>Lager</strong> (kartvy och diff). Den är{" "}
            <strong>ihopfälld som standard</strong> — klicka på raden «Lager» för att visa
            sökning och kryssrutor. Synlighet följer OCAD-filens lagerinställningar — lager som är
            dolda i filen (<code>v=0</code> i symbolträdet) startar avstängda och kan markeras som{" "}
            <em>(dolt)</em>. Saknas synlighetsflagga i filen antas lagret vara synligt, som i OCAD.
            Använd sök i lagerpanelen (t.ex. <strong>301.004</strong>) och kryssa i lagret om något
            saknas.
          </p>

          <h3 className="font-medium text-slate-900">Min position (GPS)</h3>
          <p>
            I kartvyn finns knappen <strong>Min position</strong> om kartan är georefererad och din
            enhet stödjer GPS. Ett fast sikte (crosshair) visar var du befinner dig på kartan —
            siktet behåller samma storlek på skärmen oavsett zoomnivå. Statusraden visar
            positionsnoggrannhet. Använd <strong>Panorera hit</strong> för att centrera kartan på
            din position, eller <strong>Stoppa GPS</strong> när du är klar.
          </p>
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700">
            GPS kräver georefererad karta och fungerar bäst utomhus med bra mottagning. Om kartan
            saknar georeferering visas ett felmeddelande.
          </p>

          <h3 className="font-medium text-slate-900">Öppna i nytt fönster</h3>
          <p>
            Knappen <strong>Öppna i nytt fönster</strong> i versionshistoriken öppnar kartvyn i ett
            separat fönster utan sidhuvud och navigation — bra för presentation, fältarbete eller
            arbete på en second skärm. GPS och export fungerar även i helskärmsvyn.
          </p>

          <h3 className="font-medium text-slate-900">Exportera utsnitt</h3>
          <p>
            I kartvyn (ej i Verifiera) kan du exportera ett valt område via knappen{" "}
            <strong>Exportera</strong>:
          </p>
          <HelpList
            items={[
              "Välj skala: 1:10 000, 1:7 500 eller 1:5 000",
              "Välj pappersformat: A4 eller A3",
              "Välj orientering: stående eller liggande",
              "Välj utdataformat: PDF, OCAD (.ocd) eller GeoTIFF (.tif)",
              "PDF, GeoTIFF och OCD kan inkludera öppna och pågående kartförslag (kryssruta «Inkludera kartförslag»)",
              "GeoTIFF sparas med kartans projicerade koordinatsystem (EPSG) — kräver georefererad karta",
              "OCD med kartförslag: välj symbol för punkt, linje och yta i dialogen — exportfilen innehåller bara förslagens objekt med kartans befintliga symboler (OCAD 12/2018), inte grundkartan",
              "Dra exportramen på kartan till önskat utsnitt innan du exporterar",
            ]}
          />
        </HelpSection>

        {showAdmin && (
          <HelpSection id="admin" title="Administration">
            <p>
              Administratörer hanterar systemet via flikarna{" "}
              <Link href="/admin/users" className="link-primary">Användare</Link>,{" "}
              <Link href="/admin/lagring" className="link-primary">Lagring</Link>,{" "}
              <Link href="/admin/loggning" className="link-primary">Loggning</Link> och{" "}
              <Link href="/admin/settings" className="link-primary">Inställningar</Link>.
            </p>

            <h3 className="font-medium text-slate-900">Användarhantering</h3>
            <p>
              På <Link href="/admin/users" className="link-primary">/admin/users</Link> hanterar du
              alla konton:
            </p>
            <HelpList
              items={[
                "Godkänn väntande konton och tilldela roll (läsare, redaktör eller administratör)",
                "Vid godkännande skickas e-post till användaren med behörighet och inloggningslänk",
                "Avvisa konton som inte ska få tillgång",
                "Skapa konton manuellt med e-post, namn, lösenord och roll",
                "Redigera befintliga användare (namn, e-post, roll)",
                "Notis — prenumerera på e-post vid nya versioner och checkout-händelser (användare kan också styra detta i Min profil)",
                "Bifoga .ocd — få kartfilen som bilaga i notiser (kräver Notis)",
                "Senaste inloggning visas i listan",
              ]}
            />

            <h3 className="font-medium text-slate-900">Lagring</h3>
            <p>
              Under <Link href="/admin/lagring" className="link-primary">Lagring</Link> ser du en
              dashboard med total lagring (MB), fördelning per område, uppladdningstrend per månad
              och detaljtabell med versioner, utcheckningsfiler och banor. Siffrorna baseras på
              registrerade .ocd-storlekar vid uppladdning.
            </p>

            <h3 className="font-medium text-slate-900">Loggning</h3>
            <p>
              <Link href="/admin/loggning" className="link-primary">Loggning</Link> visar
              händelser i systemet: inloggningar, uppladdningar, utcheckningar, incheckningar,
              e-postutskick med bifogad fil (och mottagare) med mera. Filtrera på användare eller
              «System» och sortera på namn, aktivitet eller datum.
            </p>

            <h3 className="font-medium text-slate-900">E-postinställningar (SMTP)</h3>
            <p>
              Under <Link href="/admin/settings" className="link-primary">Inställningar</Link>{" "}
              konfigureras SMTP för systemets e-postnotiser:
            </p>
            <HelpList
              items={[
                "SMTP-server och port (Gmail: smtp.gmail.com, port 587)",
                "Gmail-adress som avsändare och Google App-lösenord (krävs — vanligt lösenord fungerar inte)",
                "Admin-notis e-post — huvudmottagare; får alltid .ocd-bilaga vid versioner och incheckning",
                "Skicka testmail — verifiera SMTP utan bilaga",
                "Skicka testmail med bifogad fil — verifiera att bilagor fungerar",
              ]}
            />
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
              Gmail kräver app-lösenord om tvåfaktorsautentisering är på. Fel «Application-specific
              password required» betyder att vanligt lösenord används. Hamnar mailet i skräppost?
              Markera som «Inte skräppost» och lägg till avsändaren i kontakter.
            </p>

            <h3 className="font-medium text-slate-900">E-postnotiser</h3>
            <p>När SMTP är konfigurerat skickas automatiskt e-post vid:</p>
            <HelpList
              items={[
                "Ny användarregistrering — till admin/prenumeranter",
                "Nytt kartförslag — till prenumeranter",
                "Kartförslag granskat — till skaparen (om notiser påslagna)",
                "Konto godkänt — till användaren med tilldelad behörighet",
                "Tillfälligt lösenord — till användare som begärt återställning",
                "Ny kartversion uppladdad — med valfri .ocd-bilaga till berättigade mottagare",
                "Ny checkout skapad — till checkout-ägare och prenumeranter",
                "Checkin inskickad — med .ocd-bilaga till admin och prenumeranter med «Bifoga .ocd»",
                "Användare bekräftat integration — till prenumeranter",
                "Checkout integrerad — till checkout-ägare och prenumeranter",
                "Checkout avbruten av admin — till checkout-ägare och prenumeranter",
                "Påminnelse om gammal checkout — till checkout-ägare efter 7 dagar (konfigurerbart)",
              ]}
            />

            <h3 className="font-medium text-slate-900">Skapa och hantera områden</h3>
            <p>
              Endast administratörer kan skapa nya områden på startsidan. Redigera namn och radera
              område via ikonerna bredvid titeln på områdessidan.
            </p>
          </HelpSection>
        )}

        <HelpReleaseNotes />

        <HelpSection id="faq" title="Vanliga frågor">
          <div className="space-y-6">
            <div>
              <h3 className="font-medium text-slate-900">Jag kan inte logga in</h3>
              <p className="mt-1">
                Kontot kan vänta på godkännande eller ha avvisats. Skapa konto om du saknar konto
                och kontakta klubbens administratör. Godkända konton kan logga in direkt. Har du
                glömt lösenordet, använd <strong>Glömt lösenord?</strong> på inloggningssidan.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-slate-900">Jag får inga e-postnotiser</h3>
              <p className="mt-1">
                SMTP måste vara konfigurerat under Admin → Inställningar med Gmail app-lösenord.
                Aktivera notiser under <strong>Min profil</strong> (klicka ditt namn i menyn) eller
                be administratören kryssa i Notis under Admin → Användare. För .ocd-bilaga krävs
                även «Bifoga .ocd». Skicka testmail för att verifiera. Kontrollera skräppost och
                att utskick loggas under Admin → Loggning.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-slate-900">Var hittar jag release notes?</h3>
              <p className="mt-1">
                Scrolla till avsnittet <a href="#release-notes" className="link-primary">Release notes</a>{" "}
                på den här sidan — där listas nya funktioner med datum.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-slate-900">Vad är checkout?</h3>
              <p className="mt-1">
                Checkout låter redaktörer reservera ett kartområde, ladda ner en utcheckning .ocd,
                redigera i OCAD och checka in ändringarna för granskning. Andra ser ditt område som
                en färgad överlagring på kartan. Efter diff-granskning bekräftar du integrationen,
                och en administratör slår ihop ändringarna i en ny kartversion.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-slate-900">Vad är Lägg bana?</h3>
              <p className="mt-1">
                Lägg bana är ett verktyg för att rita orienteringsbanor ovanpå kartan med IOF-symboler
                701–709. Banor sparas separat och påverkar inte kartfilen. Du kan spara privata eller
                publika banor, jämföra med skuggbana och exportera som PDF.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-slate-900">Påverkar banor kartfilen?</h3>
              <p className="mt-1">
                Nej. Banor är overlay-lager som lagras separat. Kartversioner ändras bara via
                uppladdning eller checkout-integration.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-slate-900">Varför ser jag bara en version i historiken?</h3>
              <p className="mt-1">
                Versionshistoriken är en tabell med alla versioner. Om listan verkar kort kan det
                bero på att färre versioner finns uppladdade — expandera eller scrolla i tabellen.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-slate-900">GPS fungerar inte i kartvyn</h3>
              <p className="mt-1">
                Kartan måste vara georefererad och enheten måste tillåta platsåtkomst i
                webbläsaren. Prova utomhus med bra mottagning. Knappen Min position visas bara när
                GPS är tillgängligt.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-slate-900">Jag ser inte den senaste versionen</h3>
              <p className="mt-1">
                Som läsare visas bara publicerade versioner. Be en redaktör publicera versionen om
                den ska vara tillgänglig.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-slate-900">Uppladdningen misslyckades</h3>
              <p className="mt-1">
                Kontrollera att filen har ändelsen .ocd och att den inte är korrupt. Mycket stora
                filer kan ta längre tid — vänta och försök igen vid timeout.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-slate-900">Jämförelsen tar lång tid</h3>
              <p className="mt-1">
                Det är normalt för stora kartor. Sidan uppdateras automatiskt när parsning och diff
                är klar.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-slate-900">Vad är skillnaden mellan Verifiera och Jämför?</h3>
              <p className="mt-1">
                Verifiera jämför två filer tillfälligt utan att spara. Jämför i versionshistoriken
                arbetar med sparade versioner och stödjer export.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-slate-900">Varför varnas jag vid uppladdning?</h3>
              <p className="mt-1">
                Om det finns aktiva checkouts varnar systemet innan du laddar upp en hel karta.
                Full uppladdning kan påverka parallellt arbete i utcheckade områden. Använd checkout
                och integration om du redigerat via utcheckningsfiler.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-slate-900">Behöver du mer hjälp?</h3>
              <p className="mt-1">
                Kontakta klubbens administratör eller kartaansvarig i IFK Mora OK.
              </p>
            </div>
          </div>
        </HelpSection>
      </div>
    </div>
  );
}
