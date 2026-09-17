# Anyform — notes for Claude Code

## What this is

A freemium file-conversion SaaS (video/audio/image/document/spreadsheet/
presentation/ebook). npm-workspaces monorepo: `packages/shared`,
`apps/api` (Fastify API + worker), `apps/web` (Next.js 15).
Read `docs/ARCHITECTURE.md` before changing anything that crosses a package
boundary; it is the contract.

## Rules

- **The format registry is the only source of truth** for what converts to
  what: `packages/shared/src/formats.ts`. Never list formats anywhere else.
  Plans live in `packages/shared/src/plans.ts`; quota logic in `quota.ts`.
- `packages/shared` must be built (`npm run build -w @anyform/shared`) before
  the api or web typecheck; both consume `dist/`.
- Engines receive **file paths only**, never user strings on a command line.
- Error responses are always `{ error: { code, message } }` with a code from
  `ApiErrorCode` in shared.
- No enums in `schema.prisma`; status/plan columns are strings validated by
  shared types.
- Free-tier semantics (10 conversions, guest cookie, merge on signup) are
  specified in `docs/ARCHITECTURE.md` §3–4. Do not change them casually; they
  are the product's core promise.

## Commands

```
npm install
npm run build -w @anyform/shared
npm run db:generate                # prisma generate
npm run typecheck                  # all workspaces
npm test                           # vitest in shared + api
npm run dev:api / dev:worker / dev:web
npm run dev:db                     # embedded Postgres on :5433 (no Docker needed)
docker compose up -d db            # or Docker Postgres on :5432
```

## Environment quirks

- Windows dev box. Default `node` is 20 (nvm4w); 22 lives at
  `%NVM_HOME%\v22.21.1`, 24 at `C:\Program Files\nodejs`. Node 20 is enough.
- No Docker on the dev box. `npm run dev:db` runs an embedded Postgres on
  :5433 (port 5432 is taken by an unrelated postgres.exe). Data in data/pg.
- Keep shell commands short on this machine; very long heredocs get truncated.

## Design

Paper / ink / hazard-yellow, fonts Bricolage Grotesque + Instrument Sans +
IBM Plex Mono. See `docs/BRAND.md`. Every file extension is rendered in mono.
