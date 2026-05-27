# SiteOps

Mobile-first PWA for site operations, built on Next.js App Router with Supabase Auth, Drizzle ORM, and Supabase Postgres.

## Runtime

- Production target: `app/` + `app/api/` (Next.js)
- Legacy Vite prototype stack has been removed; this repository now runs only on Next.js.

## Local Setup

1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env.local` and set required values.
3. Start app:
   `npm run dev`

## Commands

- `npm run dev` -> run Next dev server on `127.0.0.1:3000`
- `npm run build` -> production build
- `npm run start` -> run production server
- `npm run lint` -> TypeScript typecheck
- `npm run test` -> unit tests (Vitest)
- `npm run test:e2e` -> Playwright smoke/e2e
- `npm run db:audit` -> pre-migration data integrity audit
- `npm run db:migrate` -> apply Drizzle migrations

## Notes

- PWA assets are in `public/manifest.json` and `public/icons/`.
- Service worker source is `app/sw.ts` (Serwist).
