# Anyform — Roadmap

Phases map to `BUSINESS_PLAN.md` §9. Ticked items exist in this repo.

## Phase 0 — Foundation (this repo)

- [x] Monorepo: `packages/shared`, `apps/api` (API + worker), `apps/web`
- [x] Format registry with 50 formats / 200+ pairs and conversion rules
- [x] Plans, quota rules, wire types, request schemas
- [x] Postgres schema (users, subscriptions, conversions, API keys)
- [x] Docker Compose with Postgres, optional MinIO, API, worker, web
- [x] Business plan, brand, architecture docs
- [x] API: auth, guest cookies, upload, quota, queue, download, billing, webhook
- [x] Worker: ffmpeg, sharp, LibreOffice, pandoc, calibre, poppler, pdf-lib engines
- [x] Web: landing + converter, pair pages, formats index, pricing, auth, dashboard

## Phase 1 — Launch (month 1–2)

- [ ] Deploy to a single Hetzner box with Caddy (TLS) + Compose
- [ ] Choose billing provider (Paddle vs Stripe Atlas) and wire real prices
- [ ] Transactional email (Resend): verification, receipt, "your file is ready"
- [ ] Plausible analytics, Sentry, uptime monitor
- [ ] Legal pages: terms, privacy, DMCA, data processing
- [ ] Sitemap + robots, OpenGraph images per pair page
- [ ] Email verification after 3 guest conversions from one IP
- [ ] Product Hunt / HN launch

## Phase 2 — Growth (month 3–6)

- [ ] Batch upload + ZIP download (Starter+)
- [ ] Tools pages: compress PDF, compress video, resize image, extract audio
- [ ] Referral: +5 free conversions per referred sign-up
- [ ] Localised pair pages: ka, ru, tr, uk, hy
- [ ] Presigned direct-to-S3 uploads (bypass the web proxy for big files)
- [ ] A/B test lifetime vs monthly free quota
- [ ] Public REST API + docs + API keys + webhooks (Pro/Business)
- [ ] One-off "10-pack" and 24-hour pass

## Phase 3 — Expansion (month 7–12)

- [ ] OCR add-on (Tesseract → searchable PDF, image → text)
- [ ] Google Drive / Dropbox / OneDrive import & export
- [ ] Chrome extension ("Convert with Anyform" on any download)
- [ ] Team seats, invoices, VAT handling
- [ ] Second worker region (US) for latency
- [ ] Malware/CSAM hash scanning on upload
- [ ] Conversion presets ("for WhatsApp", "for Kindle", "for Instagram")
