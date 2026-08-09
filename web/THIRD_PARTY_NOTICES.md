# THIRD_PARTY_NOTICES

> kartor.ifkmora.se (web) — tredjepartsprogramvara och licenser  
> Genererad: 2026-08-08  
> Detta dokument ersätter inte juridisk rådgivning.

Applikationen **web** (IFK Mora OK, privat) bygger på öppen källkod och kommersiella tjänster.
Vid distribution eller vidarelicensiering måste villkoren för respektive licens följas.

## Sammanfattning (produktion, 255 paket)

| Licens | Antal paket |
|--------|-------------|
| MIT | 163 |
| ISC | 44 |
| Apache-2.0 | 20 |
| BSD-3-Clause | 11 |
| Apache-2.0 AND LGPL-3.0-or-later | 2 |
| MIT* | 2 |
| CC-BY-4.0 | 1 |
| (MPL-2.0 OR Apache-2.0) | 1 |
| BSD-2-Clause | 1 |
| (MIT OR Apache-2.0) | 1 |
| MIT-0 | 1 |
| AGPL-3.0-or-later | 1 |
| (MIT AND Zlib) | 1 |
| MIT,Apache2 | 1 |
| Unlicense | 1 |
| 0BSD | 1 |
| UNLICENSED | 1 |
| CC0-1.0 | 1 |
| MIT AND BSD-3-Clause | 1 |

## Direkta beroenden (package.json)

| Paket | Licens | Källa |
|-------|--------|-------|
| @auth/prisma-adapter@2.11.3 | ISC | https://github.com/nextauthjs/next-auth |
| @prisma/client@5.22.0 | Apache-2.0 | https://github.com/prisma/prisma |
| @vercel/blob@2.6.1 | Apache-2.0 | https://github.com/vercel/storage |
| bcryptjs@3.0.3 | BSD-3-Clause | https://github.com/dcodeIO/bcrypt.js |
| geotiff@3.0.5 | MIT | https://github.com/geotiffjs/geotiff.js |
| jspdf@4.2.1 | MIT | https://github.com/parallax/jsPDF |
| mermaid@11.16.1 | MIT | https://github.com/mermaid-js/mermaid |
| next-auth@5.0.0-beta.32 | ISC | https://github.com/nextauthjs/next-auth |
| next@16.2.12 | MIT | https://github.com/vercel/next.js |
| nodemailer@8.0.11 | MIT-0 | https://github.com/nodemailer/nodemailer |
| ocad2geojson@2.1.23 | AGPL-3.0-or-later | https://github.com/perliedman/ocad2geojson |
| proj4@2.21.0 | MIT | https://github.com/proj4js/proj4js |
| react-dom@19.2.4 | MIT | https://github.com/facebook/react |
| react@19.2.4 | MIT | https://github.com/facebook/react |
| sharp@0.34.5 | Apache-2.0 | https://github.com/lovell/sharp |
| sharp@0.35.3 | Apache-2.0 | https://github.com/lovell/sharp |

## Särskild uppmärksamhet vid distribution

Följande produktionsberoenden har licenser som **kräver extra granskning**:

| Paket | Licens | Användning i appen | Distribution |
|-------|--------|-------------------|--------------|
| @img/sharp-win32-x64@0.34.5 | Apache-2.0 AND LGPL-3.0-or-later | Se fullständig lista | Granska licensvillkor |
| @img/sharp-win32-x64@0.35.3 | Apache-2.0 AND LGPL-3.0-or-later | Native bildrasterisering (sharp) — GeoTIFF, kartförslags-PDF | **LGPL-3.0** (tillsammans med Apache-2.0): Native module — följ LGPL vid vidaredistribution av binaries. |
| caniuse-lite@1.0.30001806 | CC-BY-4.0 | Build-time webbläsardata (Browserslist) — ingår normalt inte i körbar produkt | **CC-BY-4.0:** Attribution vid vidaredistribution av datan (låg risk i SaaS). |
| dompurify@3.4.12 | (MPL-2.0 OR Apache-2.0) | HTML-sanering (transitivt via mermaid/jspdf) — välj Apache-2.0-alternativet | **MPL-2.0 OR Apache-2.0:** Använd Apache-2.0-spåret. |
| ocad2geojson@2.1.23 | AGPL-3.0-or-later | Server-side OCAD-parsing, SVG-preview, diff, export (kärnfunktion) | **AGPL-3.0:** Kräver källkodstillgång eller separat licens. Kontakta upphovsmann. |

### ocad2geojson (AGPL-3.0-or-later)

Detta är den **viktigaste licensfrågan** för hela systemet. Biblioteket används på serversidan
för att läsa och bearbeta `.ocd`-filer. AGPL kan kräva att mottagare av nätverkstjänsten erbjuds
motsvarande källkod. Alternativ: förhandla om kommersiell licens med upphovsmannen
([github.com/perliedman/ocad2geojson](https://github.com/perliedman/ocad2geojson)) eller ersätt biblioteket.

## Extern infrastruktur (ej npm)

| Tjänst | Leverantör | Avtal |
|--------|------------|-------|
| Hosting / serverless | Vercel | Vercel ToS / kommersiellt |
| PostgreSQL | Neon | Neon ToS / kommersiellt |
| Fillagring (prod) | Vercel Blob | Vercel ToS |
| E-post | Gmail SMTP | Google ToS |
| Typsnitt | Geist via `next/font` | SIL Open Font License (OFL) |

## Applikationens egen kod

Projektet `web` är markerat `private` i `package.json` och har **ingen publicerad OSS-licens**.
Upphovsrätt tillhör IFK Mora OK / projektägaren om inget annat avtalats.

## Fullständig lista (produktion)

| Paket | Licens | Repository |
|-------|--------|------------|
| @antfu/install-pkg@1.1.0 | MIT | https://github.com/antfu/install-pkg |
| @auth/core@0.41.3 | ISC | https://github.com/nextauthjs/next-auth |
| @auth/prisma-adapter@2.11.3 | ISC | https://github.com/nextauthjs/next-auth |
| @babel/runtime@7.29.7 | MIT | https://github.com/babel/babel |
| @braintree/sanitize-url@7.1.2 | MIT | https://github.com/braintree/sanitize-url |
| @chevrotain/types@11.1.2 | Apache-2.0 | https://github.com/Chevrotain/chevrotain |
| @iconify/types@2.0.0 | MIT | https://github.com/iconify/iconify |
| @iconify/utils@3.1.4 | MIT | https://github.com/iconify/iconify |
| @img/colour@1.1.0 | MIT | https://github.com/lovell/colour |
| @img/sharp-win32-x64@0.34.5 | Apache-2.0 AND LGPL-3.0-or-later | https://github.com/lovell/sharp |
| @img/sharp-win32-x64@0.35.3 | Apache-2.0 AND LGPL-3.0-or-later | https://github.com/lovell/sharp |
| @mapbox/point-geometry@0.1.0 | ISC | https://github.com/mapbox/point-geometry |
| @mapbox/vector-tile@1.3.1 | BSD-3-Clause | https://github.com/mapbox/vector-tile-js |
| @mermaid-js/parser@1.2.0 | MIT | https://github.com/mermaid-js/mermaid |
| @next/env@16.2.12 | MIT | https://github.com/vercel/next.js |
| @next/swc-win32-x64-msvc@16.2.12 | MIT | https://github.com/vercel/next.js |
| @panva/hkdf@1.2.1 | MIT | https://github.com/panva/hkdf |
| @petamoriken/float16@3.9.3 | MIT | https://github.com/petamoriken/float16 |
| @prisma/client@5.22.0 | Apache-2.0 | https://github.com/prisma/prisma |
| @prisma/debug@5.22.0 | Apache-2.0 | https://github.com/prisma/prisma |
| @prisma/engines-version@5.22.0-44.605197351a3c8bdd595af2d2a9bc3025bca48ea2 | Apache-2.0 | https://github.com/prisma/engines-wrapper |
| @prisma/engines@5.22.0 | Apache-2.0 | https://github.com/prisma/prisma |
| @prisma/fetch-engine@5.22.0 | Apache-2.0 | https://github.com/prisma/prisma |
| @prisma/get-platform@5.22.0 | Apache-2.0 | https://github.com/prisma/prisma |
| @swc/helpers@0.5.15 | Apache-2.0 | https://github.com/swc-project/swc |
| @turf/helpers@7.3.5 | MIT | https://github.com/Turfjs/turf |
| @turf/invariant@7.3.5 | MIT | https://github.com/Turfjs/turf |
| @turf/line-offset@7.3.5 | MIT | https://github.com/Turfjs/turf |
| @turf/meta@7.3.5 | MIT | https://github.com/Turfjs/turf |
| @types/d3-array@3.2.2 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-axis@3.0.6 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-brush@3.0.6 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-chord@3.0.6 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-color@3.1.3 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-contour@3.0.6 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-delaunay@6.0.4 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-dispatch@3.0.7 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-drag@3.0.7 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-dsv@3.0.7 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-ease@3.0.2 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-fetch@3.0.7 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-force@3.0.10 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-format@3.0.4 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-geo@3.1.1 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-hierarchy@3.1.7 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-interpolate@3.0.4 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-path@3.1.1 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-polygon@3.0.2 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-quadtree@3.0.6 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-random@3.0.4 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-scale-chromatic@3.1.0 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-scale@4.0.9 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-selection@3.0.11 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-shape@3.1.8 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-time-format@4.0.3 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-time@3.0.4 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-timer@3.0.2 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-transition@3.0.9 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-zoom@3.0.8 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3@7.4.3 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/geojson@7946.0.16 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/pako@2.0.4 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/raf@3.4.3 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/trusted-types@2.0.7 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @upsetjs/venn.js@2.0.0 | MIT | https://github.com/upsetjs/venn.js |
| @vercel/blob@2.6.1 | Apache-2.0 | https://github.com/vercel/storage |
| @vercel/cli-config@0.2.1 | Apache-2.0 | https://github.com/vercel/vercel |
| @vercel/cli-exec@1.0.0 | Apache-2.0 | https://github.com/vercel/vercel |
| @vercel/oidc@3.8.1 | Apache-2.0 | https://github.com/vercel/vercel |
| arr-flatten@1.1.0 | MIT | https://github.com/jonschlinkert/arr-flatten |
| async-retry@1.3.3 | MIT | https://github.com/vercel/async-retry |
| base64-arraybuffer@1.0.2 | MIT | https://github.com/niklasvh/base64-arraybuffer |
| baseline-browser-mapping@2.11.10 | Apache-2.0 | https://github.com/web-platform-dx/baseline-browser-mapping |
| bcryptjs@3.0.3 | BSD-3-Clause | https://github.com/dcodeIO/bcrypt.js |
| bezier-js@2.6.1 | MIT | https://github.com/Pomax/bezierjs |
| buffer-from@1.1.2 | MIT | https://github.com/LinusU/buffer-from |
| caniuse-lite@1.0.30001806 | CC-BY-4.0 | https://github.com/browserslist/caniuse-lite |
| canvg@3.0.11 | MIT | https://github.com/canvg/canvg |
| client-only@0.0.1 | MIT | — |
| commander@6.2.1 | MIT | https://github.com/tj/commander.js |
| commander@7.2.0 | MIT | https://github.com/tj/commander.js |
| commander@8.3.0 | MIT | https://github.com/tj/commander.js |
| concat-stream@2.0.0 | MIT | https://github.com/maxogden/concat-stream |
| core-js@3.49.0 | MIT | https://github.com/zloirock/core-js |
| cose-base@1.0.3 | MIT | https://github.com/iVis-at-Bilkent/cose-base |
| cose-base@2.2.0 | MIT | https://github.com/iVis-at-Bilkent/cose-base |
| cross-spawn@7.0.6 | MIT | https://github.com/moxystudio/node-cross-spawn |
| css-line-break@2.1.0 | MIT | https://github.com/niklasvh/css-line-break |
| cytoscape-cose-bilkent@4.1.0 | MIT | https://github.com/cytoscape/cytoscape.js-cose-bilkent |
| cytoscape-fcose@2.2.0 | MIT | https://github.com/iVis-at-Bilkent/cytoscape.js-fcose |
| cytoscape@3.34.0 | MIT | https://github.com/cytoscape/cytoscape.js |
| d3-array@2.12.1 | BSD-3-Clause | https://github.com/d3/d3-array |
| d3-array@3.2.4 | ISC | https://github.com/d3/d3-array |
| d3-axis@3.0.0 | ISC | https://github.com/d3/d3-axis |
| d3-brush@3.0.0 | ISC | https://github.com/d3/d3-brush |
| d3-chord@3.0.1 | ISC | https://github.com/d3/d3-chord |
| d3-color@3.1.0 | ISC | https://github.com/d3/d3-color |
| d3-contour@4.0.2 | ISC | https://github.com/d3/d3-contour |
| d3-delaunay@6.0.4 | ISC | https://github.com/d3/d3-delaunay |
| d3-dispatch@3.0.1 | ISC | https://github.com/d3/d3-dispatch |
| d3-drag@3.0.0 | ISC | https://github.com/d3/d3-drag |
| d3-dsv@3.0.1 | ISC | https://github.com/d3/d3-dsv |
| d3-ease@3.0.1 | BSD-3-Clause | https://github.com/d3/d3-ease |
| d3-fetch@3.0.1 | ISC | https://github.com/d3/d3-fetch |
| d3-force@3.0.0 | ISC | https://github.com/d3/d3-force |
| d3-format@3.1.2 | ISC | https://github.com/d3/d3-format |
| d3-geo@3.1.1 | ISC | https://github.com/d3/d3-geo |
| d3-hierarchy@3.1.2 | ISC | https://github.com/d3/d3-hierarchy |
| d3-interpolate@3.0.1 | ISC | https://github.com/d3/d3-interpolate |
| d3-path@1.0.9 | BSD-3-Clause | https://github.com/d3/d3-path |
| d3-path@3.1.0 | ISC | https://github.com/d3/d3-path |
| d3-polygon@3.0.1 | ISC | https://github.com/d3/d3-polygon |
| d3-quadtree@3.0.1 | ISC | https://github.com/d3/d3-quadtree |
| d3-random@3.0.1 | ISC | https://github.com/d3/d3-random |
| d3-sankey@0.12.3 | BSD-3-Clause | https://github.com/d3/d3-sankey |
| d3-scale-chromatic@3.1.0 | ISC | https://github.com/d3/d3-scale-chromatic |
| d3-scale@4.0.2 | ISC | https://github.com/d3/d3-scale |
| d3-selection@3.0.0 | ISC | https://github.com/d3/d3-selection |
| d3-shape@1.3.7 | BSD-3-Clause | https://github.com/d3/d3-shape |
| d3-shape@3.2.0 | ISC | https://github.com/d3/d3-shape |
| d3-time-format@4.1.0 | ISC | https://github.com/d3/d3-time-format |
| d3-time@3.1.0 | ISC | https://github.com/d3/d3-time |
| d3-timer@3.0.1 | ISC | https://github.com/d3/d3-timer |
| d3-transition@3.0.1 | ISC | https://github.com/d3/d3-transition |
| d3-zoom@3.0.0 | ISC | https://github.com/d3/d3-zoom |
| d3@7.9.0 | ISC | https://github.com/d3/d3 |
| dagre-d3-es@7.0.14 | MIT | https://github.com/tbo47/dagre-es |
| dayjs@1.11.21 | MIT | https://github.com/iamkun/dayjs |
| delaunator@5.1.0 | ISC | https://github.com/mapbox/delaunator |
| detect-libc@2.1.2 | Apache-2.0 | https://github.com/lovell/detect-libc |
| dompurify@3.4.12 | (MPL-2.0 OR Apache-2.0) | https://github.com/cure53/DOMPurify |
| duplexer@0.1.2 | MIT | https://github.com/Raynos/duplexer |
| es-toolkit@1.50.0 | MIT | https://github.com/toss/es-toolkit |
| event-stream@4.0.1 | MIT | https://github.com/dominictarr/event-stream |
| execa@5.1.1 | MIT | https://github.com/sindresorhus/execa |
| fast-png@6.4.0 | MIT | https://github.com/image-js/fast-png |
| fflate@0.8.3 | MIT | https://github.com/101arrowz/fflate |
| from@0.1.7 | MIT | https://github.com/dominictarr/from |
| geojson-stream@0.1.0 | BSD-2-Clause | https://github.com/tmcw/geojson-stream |
| geojson-vt@3.2.1 | ISC | https://github.com/mapbox/geojson-vt |
| geotiff@3.0.5 | MIT | https://github.com/geotiffjs/geotiff.js |
| get-stream@6.0.1 | MIT | https://github.com/sindresorhus/get-stream |
| hachure-fill@0.5.2 | MIT | https://github.com/pshihn/hachure-fill |
| html2canvas@1.4.1 | MIT | https://github.com/niklasvh/html2canvas |
| human-signals@2.1.0 | Apache-2.0 | https://github.com/ehmicky/human-signals |
| iconv-lite@0.6.3 | MIT | https://github.com/ashtuchkin/iconv-lite |
| ieee754@1.2.1 | BSD-3-Clause | https://github.com/feross/ieee754 |
| import-meta-resolve@4.2.0 | MIT | https://github.com/wooorm/import-meta-resolve |
| inherits@2.0.4 | ISC | https://github.com/isaacs/inherits |
| internmap@1.0.1 | ISC | https://github.com/mbostock/internmap |
| internmap@2.0.3 | ISC | https://github.com/mbostock/internmap |
| iobuffer@5.4.0 | MIT | https://github.com/image-js/iobuffer |
| is-buffer@2.0.5 | MIT | https://github.com/feross/is-buffer |
| is-node-process@1.2.0 | MIT | https://github.com/mswjs/is-node-process |
| is-stream@2.0.1 | MIT | https://github.com/sindresorhus/is-stream |
| isexe@2.0.0 | ISC | https://github.com/isaacs/isexe |
| jose@5.10.0 | MIT | https://github.com/panva/jose |
| jose@6.2.7 | MIT | https://github.com/panva/jose |
| jsonparse@1.3.1 | MIT | https://github.com/creationix/jsonparse |
| JSONStream@1.3.5 | (MIT OR Apache-2.0) | https://github.com/dominictarr/JSONStream |
| jspdf@4.2.1 | MIT | https://github.com/parallax/jsPDF |
| katex@0.16.47 | MIT | https://github.com/KaTeX/KaTeX |
| khroma@2.1.0 | MIT* | https://github.com/fabiospampinato/khroma |
| layout-base@1.0.2 | MIT | https://github.com/iVis-at-Bilkent/layout-base |
| layout-base@2.0.1 | MIT | https://github.com/iVis-at-Bilkent/layout-base |
| lerc@3.0.0 | Apache-2.0 | https://github.com/Esri/lerc |
| lodash-es@4.18.1 | MIT | https://github.com/lodash/lodash |
| map-stream@0.0.7 | MIT | https://github.com/dominictarr/map-stream |
| marked@16.4.2 | MIT | https://github.com/markedjs/marked |
| merge-stream@2.0.0 | MIT | https://github.com/grncdr/merge-stream |
| mermaid@11.16.1 | MIT | https://github.com/mermaid-js/mermaid |
| mgrs@1.0.0 | MIT | https://github.com/proj4js/mgrs |
| mimic-fn@2.1.0 | MIT | https://github.com/sindresorhus/mimic-fn |
| minimist@1.2.8 | MIT | https://github.com/minimistjs/minimist |
| mkdirp@1.0.4 | MIT | https://github.com/isaacs/node-mkdirp |
| nanoid@3.3.16 | MIT | https://github.com/ai/nanoid |
| next-auth@5.0.0-beta.32 | ISC | https://github.com/nextauthjs/next-auth |
| next@16.2.12 | MIT | https://github.com/vercel/next.js |
| nodemailer@8.0.11 | MIT-0 | https://github.com/nodemailer/nodemailer |
| npm-run-path@4.0.1 | MIT | https://github.com/sindresorhus/npm-run-path |
| oauth4webapi@3.8.6 | MIT | https://github.com/panva/oauth4webapi |
| ocad2geojson@2.1.23 | AGPL-3.0-or-later | https://github.com/perliedman/ocad2geojson |
| onetime@5.1.2 | MIT | https://github.com/sindresorhus/onetime |
| os-paths@4.4.0 | MIT | https://github.com/rivy/js.os-paths |
| package-manager-detector@1.8.0 | MIT | https://github.com/antfu-collective/package-manager-detector |
| pako@2.2.0 | (MIT AND Zlib) | https://github.com/nodeca/pako |
| parse-headers@2.0.6 | MIT | https://github.com/kesla/parse-headers |
| path-data-parser@0.1.0 | MIT | https://github.com/pshihn/path-data-parser |
| path-key@3.1.1 | MIT | https://github.com/sindresorhus/path-key |
| pause-stream@0.0.11 | MIT,Apache2 | https://github.com/dominictarr/pause-stream |
| pbf@3.3.0 | BSD-3-Clause | https://github.com/mapbox/pbf |
| performance-now@2.1.0 | MIT | https://github.com/braveg1rl/performance-now |
| picocolors@1.1.1 | ISC | https://github.com/alexeyraspopov/picocolors |
| points-on-curve@0.2.0 | MIT | https://github.com/pshihn/bezier-points |
| points-on-path@0.2.1 | MIT | https://github.com/pshihn/points-on-path |
| postcss@8.4.31 | MIT | https://github.com/postcss/postcss |
| preact-render-to-string@6.5.11 | MIT | https://github.com/preactjs/preact-render-to-string |
| preact@10.24.3 | MIT | https://github.com/preactjs/preact |
| prisma@5.22.0 | Apache-2.0 | https://github.com/prisma/prisma |
| proj4@2.21.0 | MIT | https://github.com/proj4js/proj4js |
| protocol-buffers-schema@3.6.1 | MIT | https://github.com/mafintosh/protocol-buffers-schema |
| quick-lru@6.1.2 | MIT | https://github.com/sindresorhus/quick-lru |
| raf@3.4.1 | MIT | https://github.com/chrisdickinson/raf |
| react-dom@19.2.4 | MIT | https://github.com/facebook/react |
| react@19.2.4 | MIT | https://github.com/facebook/react |
| readable-stream@3.6.2 | MIT | https://github.com/nodejs/readable-stream |
| regenerator-runtime@0.13.11 | MIT | https://github.com/facebook/regenerator/tree/main/packages/runtime |
| reproject@1.2.7 | MIT | https://github.com/perliedman/reproject |
| resolve-protobuf-schema@2.1.0 | MIT | https://github.com/mafintosh/resolve-protobuf-schema |
| retry@0.13.1 | MIT | https://github.com/tim-kos/node-retry |
| rgbcolor@1.0.1 | MIT* | https://github.com/yetzt/node-rgbcolor |
| robust-predicates@3.0.3 | Unlicense | https://github.com/mourner/robust-predicates |
| roughjs@4.6.6 | MIT | https://github.com/pshihn/rough |
| rw@1.3.3 | BSD-3-Clause | https://github.com/mbostock/rw |
| safe-buffer@5.2.1 | MIT | https://github.com/feross/safe-buffer |
| safer-buffer@2.1.2 | MIT | https://github.com/ChALkeR/safer-buffer |
| scheduler@0.27.0 | MIT | https://github.com/facebook/react |
| semver@7.8.5 | ISC | https://github.com/npm/node-semver |
| sharp@0.34.5 | Apache-2.0 | https://github.com/lovell/sharp |
| sharp@0.35.3 | Apache-2.0 | https://github.com/lovell/sharp |
| shebang-command@2.0.0 | MIT | https://github.com/kevva/shebang-command |
| shebang-regex@3.0.0 | MIT | https://github.com/sindresorhus/shebang-regex |
| signal-exit@3.0.7 | ISC | https://github.com/tapjs/signal-exit |
| source-map-js@1.2.1 | BSD-3-Clause | https://github.com/7rulnik/source-map-js |
| split@1.0.1 | MIT | https://github.com/dominictarr/split |
| stackblur-canvas@2.7.0 | MIT | https://github.com/flozz/StackBlur |
| stream-combiner@0.2.2 | MIT | https://github.com/dominictarr/stream-combiner |
| string_decoder@1.3.0 | MIT | https://github.com/nodejs/string_decoder |
| strip-final-newline@2.0.0 | MIT | https://github.com/sindresorhus/strip-final-newline |
| styled-jsx@5.1.6 | MIT | https://github.com/vercel/styled-jsx |
| stylis@4.4.0 | MIT | https://github.com/thysultan/stylis.js |
| svg-pathdata@6.0.3 | MIT | https://github.com/nfroidure/svg-pathdata |
| text-segmentation@1.0.3 | MIT | https://github.com/niklasvh/text-segmentation |
| throttleit@2.1.0 | MIT | https://github.com/sindresorhus/throttleit |
| through@2.3.8 | MIT | https://github.com/dominictarr/through |
| tinyexec@1.3.0 | MIT | https://github.com/tinylibs/tinyexec |
| ts-dedent@2.3.0 | MIT | https://github.com/tamino-martinius/node-ts-dedent |
| tslib@2.8.1 | 0BSD | https://github.com/Microsoft/tslib |
| typedarray@0.0.6 | MIT | https://github.com/substack/typedarray |
| undici@6.28.0 | MIT | https://github.com/nodejs/undici |
| util-deprecate@1.0.2 | MIT | https://github.com/TooTallNate/util-deprecate |
| utrie@1.0.2 | MIT | https://github.com/niklasvh/utrie |
| uuid@14.0.1 | MIT | https://github.com/uuidjs/uuid |
| uuid@3.4.0 | MIT | https://github.com/uuidjs/uuid |
| vt-pbf@3.1.3 | MIT | https://github.com/mapbox/vt-pbf |
| web-worker@1.5.0 | Apache-2.0 | https://github.com/developit/web-worker |
| web@0.1.0 | UNLICENSED | — |
| which@2.0.2 | ISC | https://github.com/isaacs/node-which |
| wkt-parser@1.5.6 | MIT | https://github.com/proj4js/wkt-parser |
| xdg-app-paths@5.5.1 | MIT | https://github.com/rivy/js.xdg-app-paths |
| xdg-portable@7.3.0 | MIT | https://github.com/rivy/js.xdg-portable |
| xml-utils@1.10.2 | CC0-1.0 | https://github.com/DanielJDufour/xml-utils |
| xmldom@0.6.0 | MIT | https://github.com/xmldom/xmldom |
| zod@4.1.11 | MIT | https://github.com/colinhacks/zod |
| zstddec@0.2.0 | MIT AND BSD-3-Clause | https://github.com/donmccurdy/zstddec |

---

*Generera om denna fil efter större dependency-uppdateringar:*

```bash
cd web
npx tsx scripts/generate-third-party-notices.mts
```
