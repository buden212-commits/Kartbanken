<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Hjälp vid commit och deploy

Vid commit eller deploy av app-ändringar under `web/src/` eller `web/prisma/migrations/` ska du alltid uppdatera hjälpen:

- `web/src/lib/help/release-notes.ts`
- `web/src/components/help-page-content.tsx` (vid beteende- eller UI-ändringar)

Kontroller:

- **Commit** — pre-commit-hooken `check-help-updated.mts` (aktivera med `npm run hooks:install`)
- **Deploy** — `npm run deploy` kör `check-help-deploy.mts` före Vercel; Vercel-build kör samma check via `buildCommand`

Använd alltid `npm run deploy` i stället för `npx vercel deploy` direkt.

## Produktiondeploy

- `npm run deploy:prod` i `web/` (kräver miljövariabel `VERCEL_TOKEN`)
- Skapa token: https://vercel.com/account/tokens
- Spara som Cursor Secret `VERCEL_TOKEN` och som GitHub Actions secret med samma namn
- Push till `main` kör GitHub Action «Deploy production»
