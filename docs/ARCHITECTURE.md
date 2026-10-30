# Anyform — Architecture

This is the contract every part of the codebase is built against. If you
change a rule here, change the code that implements it in the same commit.

## 1. System overview

```
 Browser ──────► apps/web (Next.js 15, port 3000)
    │               │  /api/* is rewritten server-side to the API, so the
    │               │  browser only ever talks to one origin (no CORS,
    │               │  cookies are first-party).
    │               ▼
    └─────────► apps/api  src/server.ts (Fastify 5, port 4000)
                    │   auth · quota · upload · jobs · billing · download
                    │
          ┌─────────┼──────────────┐
          ▼         ▼              ▼
      Postgres   pg-boss queue   Storage (local disk | S3/R2/MinIO)
      (Prisma)   (in Postgres)      ▲
                    │               │
                    ▼               │
             apps/api  src/worker.ts ┘
             picks an engine, runs it, writes progress + output
             ffmpeg · sharp · libreoffice · pandoc · calibre · poppler · pdf-lib
```

One Postgres instance is the database **and** the job queue (pg-boss), so a
production deployment is: Postgres + one API container + N worker containers +
the web container. No Redis.

`packages/shared` is imported by both apps and owns: the format registry and
conversion rules, plan definitions, quota logic, wire (DTO) types, zod request
schemas, and small formatting helpers.

## 2. Repository layout

```
anyform/
├── apps/
│   ├── api/                 Fastify API + worker (one package, two entrypoints)
│   │   ├── prisma/schema.prisma
│   │   └── src/
│   │       ├── server.ts    API entrypoint
│   │       ├── worker.ts    Worker entrypoint
│   │       ├── config.ts    env parsing (zod)
│   │       ├── db.ts        Prisma client
│   │       ├── queue.ts     pg-boss setup, job names, payload types
│   │       ├── storage/     StorageDriver interface, local + s3 drivers
│   │       ├── auth/        password hashing, jwt cookie, guest cookie, request identity
│   │       ├── quota/       usage counting + enforcement
│   │       ├── billing/     BillingProvider interface, stripe.ts implementation, webhook handler
│   │       ├── routes/      auth, conversions, usage, billing, formats, health
│   │       ├── engines/     one file per engine + registry that maps (from,to) → engine
│   │       └── jobs/        convert job handler, cleanup job
│   └── web/                 Next.js 15 App Router + Tailwind v4
│       └── src/
│           ├── app/         routes (see §7)
│           ├── components/  converter, format chips, pricing table, etc.
│           └── lib/         api client, session helpers
├── packages/shared/         registry, plans, quota, types, schemas
├── infra/                   Dockerfiles
├── docs/                    this folder
├── docker-compose.yml
└── .env.example
```

## 3. Identity: users and guests

- **Guest**: on first API call the server sets `af_guest` — an httpOnly,
  signed cookie containing a random UUID (`@fastify/cookie` signing with
  `COOKIE_SECRET`). Conversions created by a guest store `guestId`.
- **User**: email + password (bcryptjs, cost 12). On login/signup the server
  sets `af_session`, an httpOnly JWT cookie (`@fastify/jwt`, 30-day expiry,
  `SameSite=Lax`, `Secure` in production).
- **Merge**: on signup or login, every `Conversion` with the current
  `guestId` and `userId = null` is updated to the user. `guestId` is kept
  (and is stored on rows made while signed in too), so the free count follows
  the person to their account and cannot be reset by signing up or by logging
  out again. Guests can only open rows that are still unclaimed.
- **Session version**: the JWT carries `sv` = `User.sessionVersion` at
  sign-in. Changing or resetting the password increments it, so every
  session issued before that stops resolving to the user (other devices are
  signed out; the device that made the change gets a fresh cookie).
- **Password reset**: `POST /auth/forgot` always answers 202 and sends the
  email after responding, so it reveals neither whether an account exists
  nor (by timing) which. The link carries a 256-bit random token; only its
  SHA-256 is stored (`PasswordReset`). It works once, for 60 minutes; a newer
  link revokes older ones, and a second request inside a minute sends
  nothing. Email goes through `apps/api/src/mail` (`MAIL_DRIVER`: `log` in
  development, `resend` in production).
- Request identity is resolved once per request into
  `{ userId?, guestId, plan, planSource, credits, passUntil? }` and attached to
  `request.identity`. `plan` is the subscription's plan, or `starter` while a
  24-hour pass is active (`planSource` says which).

## 4. Quota rules

Implemented in `packages/shared/src/quota.ts` and enforced in
`apps/api/src/quota/`.

1. `FREE_CONVERSIONS` (default **10**) is the free allowance.
2. `FREE_QUOTA_PERIOD` is `lifetime` (default) or `monthly` (resets at the
   start of each UTC calendar month).
3. **Used** = number of `Conversion` rows for the identity (by `userId` if
   logged in, else every row carrying this browser's `guestId`) whose status is not `failed` and whose
   `chargedAs` is `free`, within the period. Failed jobs never cost a
   conversion.
   - **Pack credits** (`User.credits`, never expire) are spent only once the
     free allowance is used up: the upload route decrements one atomically
     (`credits > 0` guard) and records `chargedAs = credit`; a failed job gives
     it back once (`credit` → `credit_refunded`).
   - Conversions under a subscription or pass record `plan` / `pass` and touch
     neither the allowance nor credits.
4. Paid plans (`starter`, `pro`, `business`) have **no count limit**. They
   are limited by `maxFileBytes`, `concurrentJobs`, `batchSize` and
   `retentionHours` from `PLANS`.
5. Free guests and free users share the same rules; guests additionally get
   an IP-hash rate limit (20 uploads / hour / IP) as abuse protection.
6. A request that would exceed the free allowance returns
   `402 QUOTA_EXCEEDED` with the current `UsageDTO`. The web app shows the
   paywall.
7. A file larger than the plan's `maxFileBytes` returns `413 FILE_TOO_LARGE`.
8. More running jobs than `concurrentJobs` returns `429 TOO_MANY_CONCURRENT`.

## 5. Conversion lifecycle

```
POST /v1/conversions (multipart: file, target[, options])
  1. resolve identity, plan
  2. validate target ext & canConvert(sourceExt, targetExt)   → 400 UNSUPPORTED_*
  3. check size (Content-Length / stream limit) → 413
  4. check quota → 402 ; check concurrency → 429
  5. stream file to storage at   src/{yyyy}/{mm}/{conversionId}.{ext}
  6. insert Conversion {status: queued, expiresAt: now + plan.retentionHours}
  7. boss.send("convert", { conversionId }, { priority: plan.priority, retryLimit: 1, expireInSeconds: JOB_TIMEOUT })
  8. return 201 { conversion, usage }

worker: boss.work("convert", { teamSize: WORKER_CONCURRENCY })
  1. load Conversion; set status=processing, startedAt
  2. engine = resolveEngine(sourceExt, targetExt); if !engine.available → fail ENGINE_UNAVAILABLE
  3. download source to a tmp dir; run engine with progress callback (0–100 → DB every ≥1s / ≥5%)
  4. upload output to  out/{yyyy}/{mm}/{conversionId}.{targetExt}
  5. set status=done, outputKey, outputName, outputBytes, engine, finishedAt, progress=100
  on error: status=failed, error message (sanitised, ≤500 chars), progress unchanged

GET /v1/conversions/:id             → ConversionDTO (owner only; guests match by guestId)
GET /v1/conversions/:id/download    → streams output with Content-Disposition (local)
                                      or 302 to a presigned URL (s3). 409 NOT_READY if not done, 410 EXPIRED after expiresAt.
DELETE /v1/conversions/:id          → deletes source+output from storage, row kept with status unchanged & keys nulled
cleanup job (every 10 min): delete storage objects for rows past expiresAt; null keys
```

Web polls `GET /v1/conversions/:id` every 1.5 s while queued/processing.

## 6. API surface (`/v1`)

| Method & path | Auth | Purpose |
| --- | --- | --- |
| `GET /health` | – | `{ ok, version, uptimeSeconds, engines[] }` |
| `GET /formats` | – | Registry + pairs (for external consumers; the web imports shared directly) |
| `POST /auth/signup` | – | body `{ email, password, name? }` → sets session cookie, merges guest, `{ user }` |
| `POST /auth/login` | – | body `{ email, password }` → same |
| `POST /auth/logout` | session | clears cookie |
| `GET /auth/me` | session | `{ user }` or 401 |
| `POST /auth/forgot` | – | body `{ email }` → always 202; emails a reset link if the account exists |
| `POST /auth/reset` | – | body `{ token, password }` → sets the password, signs out other sessions, logs in, `{ user }`; 400 if the link expired or was used |
| `PATCH /account` | session | body `{ name?, email?, currentPassword? }` (password required to change email) → `{ user }`; 409 if the email is taken |
| `POST /account/password` | session | body `{ currentPassword, newPassword }` → signs out other sessions, fresh cookie, `{ user }` |
| `DELETE /account` | session | body `{ password }` → deletes files, history and account, 204; 409 `active_subscription` while a subscription is active and not set to cancel |
| `GET /usage` | guest or session | `UsageDTO` |
| `POST /conversions` | guest or session | multipart → `201 CreateConversionResponse` |
| `GET /conversions` | session | `{ conversions: ConversionDTO[] }` newest first, limit 100 |
| `GET /conversions/:id` | owner | `ConversionDTO` |
| `GET /conversions/:id/download` | owner | file |
| `DELETE /conversions/:id` | owner | 204 |
| `POST /billing/checkout` | session | body `{ plan, interval }` (subscription) or `{ product: "pack" | "pass" }` → `{ url }` |
| `POST /billing/portal` | session | `{ url }` |
| `POST /billing/webhook` | provider signature | raw body; updates Subscription + User.plan |

Errors are always `{ error: { code, message, details? } }` with the codes in
`packages/shared/src/types.ts`.

## 7. Web routes

| Route | Rendering | Content |
| --- | --- | --- |
| `/` | static | Hero with converter, popular pairs, how it works, pricing teaser, FAQ |
| `/convert/[pair]` | static for `POPULAR_PAIRS`, dynamic otherwise; 404 if `parsePairSlug` fails | Converter pre-set to the pair, unique copy from format blurbs, HowTo JSON-LD, related pairs |
| `/formats` | static | All formats by category, each linking to its top pairs |
| `/pricing` | static | Plan table with monthly/yearly toggle, FAQ |
| `/login`, `/signup` | client | Forms validated with shared zod schemas |
| `/forgot-password`, `/reset-password` | client | Ask for a reset link; set a new password from the emailed link (page sends no Referer) |
| `/account` | dynamic | Profile (name, email), change password, delete account |
| `/dashboard` | dynamic (server reads session via API) | Usage meter (free count, pack credits, pass), history, download/delete, manage billing |
| `/checkout` | client | Opens Paddle's checkout overlay for `?_ptxn=` (Paddle default payment link) |
| `/legal/terms`, `/legal/privacy` | static | Placeholders to be reviewed by a lawyer |

`next.config.ts` rewrites `/api/:path*` → `${API_INTERNAL_URL}/v1/:path*`.
The browser calls `/api/...` with `credentials: "same-origin"`.

## 8. Engines

| Engine | Binary | Handles |
| --- | --- | --- |
| `ffmpeg` | `ffmpeg-static` npm binary, or `FFMPEG_PATH` | video↔video, video→audio, audio↔audio, video↔gif |
| `sharp` | in-process (libvips) | jpg/png/webp/gif/avif/tiff/svg(in) ↔ each other |
| `imagemagick` | `magick`/`convert` on PATH | bmp, ico, heic(in) and any image pair sharp cannot do |
| `pdf-lib` | in-process | image → pdf |
| `poppler` | `pdftoppm`, `pdftotext` | pdf → jpg/png/webp, pdf → txt |
| `libreoffice` | `soffice --headless --convert-to` | office documents, presentations, spreadsheets, pdf → docx/odt |
| `pandoc` | `pandoc` | md/html/txt/rtf/docx/odt ↔ each other, → epub |
| `calibre` | `ebook-convert` | epub/mobi/azw3/fb2 ↔ each other, → pdf/docx/txt |

`engines/registry.ts` exposes `resolveEngine(from, to)` and
`probeEngines()`. Resolution order for a pair is fixed and documented in that
file; the first available engine wins. Each engine runs in a fresh temp
directory, with a hard timeout (`JOB_TIMEOUT_MS`), stdout/stderr captured, and
is passed **only file paths** — never user strings on the command line.

## 9. Storage

`StorageDriver` interface: `put(key, stream|buffer, contentType)`,
`getStream(key)`, `getSignedUrl?(key, filename, ttl)`, `delete(key)`,
`stat(key)`. Two drivers: `local` (root `STORAGE_LOCAL_DIR`; api and worker
share a volume) and `s3` (any S3-compatible endpoint). Keys never contain
user-supplied strings; the original filename is stored in the DB and applied
at download time via `Content-Disposition`.

## 10. Billing

`BillingProvider` interface: `createCheckout(user, item) → url` (item = a
subscription or a one-time product), `createPortal(user) → url`,
`handleWebhook(rawBody, headers) → events`. Providers translate events into
`billing/apply.ts`: `applySnapshot` (Subscription row + `User.plan`;
`active`/`trialing` → the plan, anything else → `free`) and `grantPurchase`
(one-time products; `Purchase.providerTransactionId` is unique, so a
re-delivered webhook grants nothing).

- **Paddle** (default when `PADDLE_API_KEY` is set; `BILLING_PROVIDER` forces
  one). Merchant of record: sells to the buyer, remits VAT / US sales tax and
  pays out to Georgia, where Stripe doesn't operate. Checkout creates a
  transaction (`custom_data.userId`) and returns
  `${WEB_ORIGIN}/checkout?_ptxn=…`, where Paddle.js opens the overlay; set
  that page as the default payment link in Paddle. Webhooks are verified with
  `Paddle-Signature` (HMAC-SHA256 of `ts:body`, ±5 min); handled events:
  `subscription.*`, `transaction.completed` (packs/passes). Users map by
  `custom_data.userId` or `User.paddleCustomerId`. Portal:
  `/customers/{id}/portal-sessions`. `scripts/paddle-setup.mjs` creates the
  products and prices.
- **Stripe** (for a non-Georgian entity): Checkout in `subscription` or
  `payment` mode; `checkout.session.completed` in payment mode grants packs
  and passes.
- Price ids for both come from `<PROVIDER>_PRICE_*` (`billing/prices.ts`).
- Products: subscriptions per `plans.ts`; `pack` = 20 credits ($4.99);
  `pass` = Starter limits for 24 h ($2.99), extending an unexpired pass.

## 11. Security & abuse

- Inputs are never executed; engines get file paths only.
- **Untrusted files vs. engines** (each engine picks a parser from the file's
  content, not its name, so a renamed file is the main attack):
  - pandoc runs with `--sandbox`: it may read only the input. (Before this,
    `![x](file:///etc/passwd)` in Markdown/HTML was embedded into html, docx,
    odt, epub and pdf outputs.)
  - ffmpeg reads uploads with `-protocol_whitelist file` and a demuxer
    allowlist (`INPUT_DEMUXERS`), so playlists (HLS), concat lists and
    network protocols are refused.
  - ImageMagick: the input coder is always pinned by extension
    (`INPUT_CODERS`), `apps/api/config/imagemagick/policy.xml` (loaded via
    `MAGICK_CONFIGURE_PATH`) disables script/URL/text coders and every
    delegate and caps memory/size/time; SVG is rasterised by sharp first.
  - sharp/libvips: every loader is blocked except jpeg/png/webp/gif/heif/tiff/svg.
  - LibreOffice: each job's fresh profile is seeded with macros disabled
    (level 3, DisableMacrosExecution) and BlockUntrustedRefererLinks.
  - Production: the worker runs on an internal Docker network with no route
    out (`docker-compose.prod.yml`), as a non-root user with no capabilities,
    so a file that tricks an engine into fetching URLs reaches nothing.
- Client IP: X-Forwarded-For is believed only from `TRUST_PROXY` (default
  loopback + private networks), so rate limits can't be dodged with a fake header.
  This holds only if the public edge overwrites the header: Next.js forwards the
  client's X-Forwarded-For untouched, so Caddy sets it to the peer address and
  the base compose file binds web/api to 127.0.0.1.
- CSRF: SameSite=Lax cookies, plus the API refuses POST/PATCH/DELETE whose
  `Origin` is not the site's (webhooks exempt; they are signed).
- Login: 10 wrong passwords per email from one IP per 15 min locks that pair;
  100 from any IPs locks the email (in-memory,
  single API process); unknown emails cost the same bcrypt time as wrong passwords.
- Web pages send CSP (self + Paddle only, `frame-ancestors 'none'`),
  X-Frame-Options, Permissions-Policy, Referrer-Policy; post-login redirects
  are same-site paths only (`safeNextPath`). Downloads carry
  `Content-Security-Policy: default-src 'none'; sandbox`.
- Filenames are sanitised (`safeFilename`), storage keys are server-generated.
- Rate limits: 100 req/min per IP globally; 20 uploads/hour per IP for guests.
- Passwords: bcryptjs cost 12. JWT: HS256 with `JWT_SECRET`, 30 days,
  invalidated early by a password change or reset (§3).
- Auth rate limits: 20 req/15 min per IP for signup/login/reset, 5/15 min for
  forgot-password, 10/15 min for account changes.
- Cookies: httpOnly, `SameSite=Lax`, `Secure` in production.
- Retention enforced by the cleanup job; "Delete now" available to owners.
- No third-party scripts on the site; analytics is cookieless (Plausible).

## 12. Local development

```
cp .env.example .env
docker compose up -d db                 # Postgres only — or `npm run dev:db` for an embedded one on :5433
npm install
npm run build -w @anyform/shared
npm run db:generate && npm run db:migrate
npm run dev:api      # :4000
npm run dev:worker
npm run dev:web      # :3000
```

Without LibreOffice/pandoc/calibre installed locally, those pairs fail with
`ENGINE_UNAVAILABLE`; ffmpeg (bundled), sharp and pdf-lib work everywhere.
`docker compose up --build` runs the full stack with all engines.

## 13. Implementation notes (as built)

Decisions made while implementing that refine the contract above:

- **Download URL**: `ConversionDTO.downloadUrl` is API-relative
  (`/v1/conversions/:id/download`). The web app builds its own
  `/api/conversions/:id/download` link, which the Next.js rewrite proxies.
- **Upload field order**: the web sends the `target` multipart field before
  the `file` part so the API can reject an unsupported pair before consuming
  the stream. `?target=mp3` as a query parameter is also accepted.
- **402 payload**: `QUOTA_EXCEEDED` errors carry the current `UsageDTO` in
  `error.details`; the web paywall reads it from there.
- **Duplicate email** on signup returns `409 CONFLICT`.
- **Worker concurrency**: pg-boss 10 has no `teamSize`; the worker registers
  `WORKER_CONCURRENCY` independent `work()` handlers with `batchSize: 1`.
- **Retries**: deterministic engine failures mark the row `failed` with no
  retry; storage/DB failures rethrow so pg-boss retries once.
- **Guest abuse limit**: 20 uploads/hour/IP (`GUEST_UPLOADS_PER_HOUR`) is
  enforced in the handler by counting rows by `ipHash`, plus a coarse
  120/hour/IP plugin limit on the upload route.
- **Engine chaining**: `document → ebook` runs LibreOffice (→ docx) and then
  calibre or pandoc when no single engine covers the pair.
- **Health**: `GET /v1/health?engines=1` includes engine availability;
  without the flag the probe is skipped to keep the endpoint cheap.
- **Cleanup**: sets `sourceKey` to `""` and `outputKey` to `null` after
  deleting objects; the row and its status remain for history.
- **Stripe v18**: `current_period_end` is read from the subscription item
  (Stripe API "basil"), with a legacy fallback.
- Extra env vars with defaults: `API_HOST`, `COOKIE_DOMAIN`,
  `PDFTOTEXT_PATH`, `PDFTOHTML_PATH`, `MAGICK_PATH`, `GUEST_UPLOADS_PER_HOUR`,
  `GLOBAL_RATE_LIMIT_PER_MINUTE`, `CLEANUP_CRON`.
