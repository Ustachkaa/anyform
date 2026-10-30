# Anyform — Deployment guide

Two proven ways to host this. Start with **Option A**; it is the cheapest,
simplest and matches the unit economics in the business plan. Move to
Option B when you need multi-region or want zero server maintenance.

## Option A — One VPS with Docker Compose (recommended to start)

**Cost**: about €30/month for a Hetzner CPX41 (8 vCPU, 16 GB, 20 TB
traffic). Handles roughly 400k conversions/month. DigitalOcean, Vultr or
Contabo work the same way.

### 1. Buy the domain and the server

- Domain: `anyform.app` (or your fallback) at Cloudflare Registrar or
  Namecheap. Point DNS `A` records for `@` and `www` at the server IP. Keep
  Cloudflare proxying **off** (grey cloud) for the first deploy so Caddy can
  obtain certificates; you can turn it on afterwards.
- Server: Ubuntu 24.04, add your SSH key, enable the firewall for 22/80/443.

### 2. Install Docker on the server

```bash
ssh root@YOUR_SERVER_IP
curl -fsSL https://get.docker.com | sh
apt-get install -y git
```

### 3. Push the repo somewhere the server can pull it

```bash
# on your PC, once
git remote add origin git@github.com:YOUR_USER/anyform.git
git push -u origin main
```

### 4. Configure

```bash
# on the server
git clone git@github.com:YOUR_USER/anyform.git /opt/anyform
cd /opt/anyform
cp .env.example .env
nano .env
```

Set at least:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `POSTGRES_PASSWORD` | long random string (used by docker-compose.prod.yml) |
| `JWT_SECRET`, `COOKIE_SECRET` | two different long random strings (`openssl rand -hex 48`) |
| `WEB_ORIGIN`, `NEXT_PUBLIC_SITE_URL` | `https://anyform.app` |
| `API_PUBLIC_URL` | `https://anyform.app` (webhook URLs are built from this) |
| `COOKIE_DOMAIN` | leave empty (web and api share one origin behind Caddy) |
| `STORAGE_DRIVER` | `local` to start; `s3` with Cloudflare R2 once you have >50 GB of files |
| `STRIPE_*` or Paddle keys | from the billing provider dashboard (see §Billing) |

Edit `infra/Caddyfile`: replace `anyform.app` and the email.

### 5. Launch

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose logs -f api worker
```

The API container runs `prisma migrate deploy` on start, so the schema is
created automatically. Caddy fetches a TLS certificate on first request.
Open `https://anyform.app` and `https://anyform.app/api/health?engines=1`.

### 6. Operate

- **Deploy an update**: `git pull && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`
- **Backups**: nightly `docker compose exec db pg_dump -U anyform anyform | gzip > /backup/$(date +%F).sql.gz`
  via cron, synced to object storage. Uploaded files are ephemeral by design
  (2 h–30 d retention) and do not need backups.
- **Monitoring**: point an uptime checker (Better Stack, UptimeRobot) at
  `/api/health`. Add Sentry DSNs to the api and web when ready.
- **Scaling**: raise `worker.deploy.replicas` in `docker-compose.prod.yml`
  or move workers to a second box pointed at the same `DATABASE_URL` and an
  S3 store (`STORAGE_DRIVER=s3`).

## Option B — Managed platforms

| Piece | Service | Notes |
| --- | --- | --- |
| Web (`apps/web`) | **Vercel** | Import the repo, root directory `apps/web`, build command `npm run build -w @anyform/shared && npm run build -w @anyform/web`, set `API_INTERNAL_URL` to the API's public URL |
| API + worker (`apps/api`) | **Fly.io** or **Railway** | Build from `infra/api.Dockerfile`; two processes from the same image (`node apps/api/dist/server.js`, `node apps/api/dist/worker.js`). Workers need ≥2 GB RAM for LibreOffice |
| Postgres | **Neon** or **Supabase** | Set `DATABASE_URL`; pg-boss needs a normal Postgres, which both are |
| Files | **Cloudflare R2** | `STORAGE_DRIVER=s3`, `S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com`, no egress fees |

The web app must proxy `/api/*` to the API (already configured in
`next.config.ts` via `API_INTERNAL_URL`) so cookies stay first-party. Expect
roughly $40–80/month at low traffic; more than Option A, less maintenance.

## Billing setup

The business plan recommends **Paddle** as merchant of record for a Georgian
company (handles VAT/sales tax, pays out to a Georgian bank). The code today
implements **Stripe**; a Paddle adapter goes in `apps/api/src/billing/`
alongside `stripe.ts` and implements the same `BillingProvider` interface.

If you use Stripe (via a US LLC or Stripe Atlas):

1. Create three products (Starter, Pro, Business) with monthly and yearly
   prices; paste the six `price_...` ids into `STRIPE_PRICE_*`.
2. Add a webhook endpoint `https://anyform.app/webhooks/billing` for
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`; paste the
   signing secret into `STRIPE_WEBHOOK_SECRET`.
3. Enable the Customer Portal in Stripe settings.

## Pre-launch checklist

- [ ] Domain bought, DNS pointed, HTTPS working
- [ ] Real billing keys; test a checkout with a test card end to end
- [ ] Terms and privacy pages reviewed (currently placeholders)
- [ ] Transactional email (Resend) for password reset and receipts
- [ ] Analytics (Plausible) and error tracking (Sentry)
- [ ] Nightly database backup cron
- [ ] Submit `https://anyform.app/sitemap.xml` to Google Search Console
