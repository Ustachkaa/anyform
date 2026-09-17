# Anyform — Business Plan

_Version 0.1 · September 2026 · Working document, revise as you learn._

> **Anyform** converts any file into any other format in the browser: drop a
> file, pick a target, download. Video, audio, images, documents,
> spreadsheets, presentations and ebooks. 10 free conversions for every
> visitor, then a subscription from $7.99/month. No ads, no credit maths, no
> tricks.

---

## 1. The one-paragraph pitch

Every week, hundreds of millions of people hit a format wall: an iPhone photo
that is HEIC, a screen recording that is WebM, a PDF that needs to be Word, a
voice memo that needs to be MP3. The incumbents (Convertio, CloudConvert,
Zamzar, FreeConvert, Online-Convert) solved the technical problem years ago, but
their free tiers are a maze of daily minute caps, "credits", ad walls and
100 MB limits, and their interfaces look like 2014. Anyform wins on **clarity
and trust**: one obvious limit (10 free conversions), zero ads, a fast modern
interface, and transparent auto-deletion of files. It is a classic freemium SEO
business with negligible marginal cost, built to be run profitably by one or two
people.

## 2. Problem

| Who | The wall they hit | What they do today |
| --- | --- | --- |
| Everyone with an iPhone and a Windows PC | `.heic` photos and `.mov` videos that Windows, Android and web forms reject | Google "heic to jpg", land on an ad-heavy converter, get confused by limits |
| Students, office workers | PDF ↔ Word, PowerPoint → PDF, Excel → CSV | Adobe's free tools (limited), Google Docs round-trips, dodgy converters |
| Creators, podcasters | MP4 → MP3, WAV → MP3, MOV → MP4, MP4 → GIF | HandBrake / Audacity (heavy) or online tools |
| Readers | EPUB ↔ MOBI/AZW3 for Kindle | Calibre (powerful, intimidating) |
| Developers & small businesses | Automated conversion in a pipeline | CloudConvert API (good, but pricing by credits is opaque) |

The pain is not "conversion is impossible" but "the free path is
frustrating and the paid path is confusing". That is a UX and pricing problem,
which is exactly where a new entrant can differentiate.

## 3. Market and demand

Demand is almost entirely **search-driven**. Format-pair queries are some of
the highest-volume utility searches on the web. Rough global monthly search
volumes (order-of-magnitude estimates from public SEO tools; re-verify with
Ahrefs/Semrush before committing budget):

| Query family | Approx. global monthly searches |
| --- | --- |
| "pdf to word" / "pdf to docx" | several million |
| "heic to jpg" | 1–3 million |
| "mp4 to mp3" / "youtube to mp3" (excluded — see §11) | 1–3 million |
| "mov to mp4", "webp to png", "png to jpg", "jpg to pdf" | 300k–1M each |
| Long tail (`mkv to mp4`, `epub to pdf`, `csv to xlsx`, …) | tens of thousands each, thousands of pairs |

Public traffic estimates put the top five competitors at a combined
**100M+ visits per month**. Capturing 0.5% of that (~500k visits/month) is a
realistic 18–24 month goal for a well-executed SEO play and, per the model in
§8, is enough for a healthy solo business.

The market is fragmented and no player has a strong brand. Nobody says
"just Convertio it". That is the opening.

## 4. Reference competitors

Figures from public pricing pages as of 2025; treat as approximate and
re-check before launch.

| | **Convertio** | **CloudConvert** | **Zamzar** | **FreeConvert** | **Online-Convert** |
| --- | --- | --- | --- | --- | --- |
| Founded | 2014 | 2012 | 2006 | 2018 | 2006 |
| Free tier | 100 MB/file, 10 conversion-minutes/day, 2 concurrent | 25 conversions/day (registered), 1 GB | 50 MB/file, 2 files/day | 1 GB/file, 25 min/day, **ads** | 100 MB/file, **ads** |
| Entry paid | Light $9.99/mo (500 MB) | $9.99/mo or credit packs from $9 | Basic $9/mo (200 MB) | Basic $9.99/mo (1.5 GB) | ~$8/mo |
| Mid | Basic $14.99/mo (1 GB) | usage-based | Pro $16/mo (400 MB) | Standard $14.99/mo (3 GB) | ~$12/mo |
| Top | Unlimited $25.99/mo (2 GB) | usage-based | Business $25/mo (2 GB) | Pro $25.99/mo (10 GB) | ~$25/mo |
| API | Yes | **Best in class** | Yes | Yes | Yes |
| Positioning | Broadest format list, OCR | Developer-first, privacy | Oldest, "trusted" | Free & generous, ad-funded | European, GDPR |
| Weakness we exploit | Minute-based metering is confusing; dated UI | Credits are opaque; consumer UX is dry | Tiny free tier, slow, old UI | Ads everywhere, slow queues | Ads, cluttered |

**What they all do that we copy** (table stakes):

- Convert without signing up.
- Programmatic landing page for every format pair (`/convert/mp4-to-mp3`),
  which is where ~90% of their traffic lands.
- Drag-and-drop, progress bar, one-click download, batch on paid tiers.
- Auto-delete files after a stated period; state it loudly.
- Pricing page with a monthly/yearly toggle and a highlighted middle plan.
- API on the higher tiers.

**What we deliberately do differently:**

1. **One limit, in plain words.** "10 free conversions." Not minutes, not
   credits, not per-day. This is the whole free-tier story and it fits in a
   tweet.
2. **No ads, on any tier.** The free tier is a funnel, not an ad inventory.
   Ads are what make the competitors feel untrustworthy with your files.
3. **Speed and design.** Sub-second page loads, a memorable visual identity,
   conversion starts on drop, target picker pre-selected from the URL.
4. **Honest engine transparency.** Every result says what produced it
   (ffmpeg, LibreOffice…). Power users trust this; nobody else shows it.
5. **Regional SEO.** Localised pair pages in Georgian, Russian, Turkish,
   Ukrainian and Armenian, where competition is thin and the founder has a
   language advantage.

## 5. Product

### 5.1 Core (this repository, MVP)

- **Converter**: drop → detect format → pick target → convert → download.
  Guest-friendly; a signed cookie tracks the 10 free conversions and the
  count carries over when the guest signs up.
- **200+ format pairs** across 7 categories, driven by a single registry in
  `packages/shared/src/formats.ts`.
- **SEO pair pages**: `/convert/{from}-to-{to}` with unique copy, a
  pre-configured converter, HowTo structured data and a related-pairs grid.
- **Accounts & dashboard**: history, remaining conversions, re-download,
  delete now, manage subscription.
- **Subscriptions**: Free / Starter / Pro / Business, monthly or yearly, via
  Stripe Checkout + Customer Portal (behind a billing adapter so Paddle can
  be swapped in — see §10).
- **Trust**: files encrypted at rest, deleted after the plan's retention
  window (2 h on Free), "Delete now" button, no third-party trackers.

### 5.2 Growth features (post-launch, see `ROADMAP.md`)

Batch & ZIP download, presets ("for WhatsApp", "for Kindle"), image
compression and resize tools, PDF tools (merge/split/compress — high search
volume, same infra), OCR add-on, REST API + webhooks, Google Drive / Dropbox
import, Chrome extension, team seats, localisation.

## 6. Pricing

| | **Free** | **Starter** | **Pro** ★ | **Business** |
| --- | --- | --- | --- | --- |
| Price (monthly) | $0 | $7.99 | $14.99 | $29.99 |
| Price (yearly, per month) | — | $5.99 | $11.99 | $23.99 |
| Conversions | **10 total** | Unlimited | Unlimited | Unlimited |
| Max file size | 100 MB | 500 MB | 2 GB | 5 GB |
| Concurrent jobs | 1 | 2 | 5 | 20 |
| Batch | 1 | 10 | 100 | 500 |
| Downloads kept | 2 hours | 24 hours | 7 days | 30 days |
| Queue priority | Standard | Standard+ | Priority | Top |
| API | — | — | 1,000 calls/mo | 25,000 calls/mo + webhooks |
| Seats | 1 | 1 | 1 | 5 |
| Ads | None | None | None | None |

**Why this shape**

- Entry price slightly under the cluster of $9–$9.99 entry plans, so the
  "cheapest no-ads converter" comparison lands in our favour.
- Pro is the highlighted plan and is priced at the same $14.99 as Convertio
  Basic and FreeConvert Standard while offering a larger file cap (2 GB vs
  1–3 GB) plus API access, so the comparison table is easy to win.
- Yearly billing at ~20–25% off. Yearly prepay is the single biggest lever
  for cash flow in a solo business.
- **Fair use** rather than minute metering: unlimited conversions on paid
  tiers, throttled by concurrency and file size. Video is the expensive
  category; concurrency caps keep the worst case bounded (§8).
- **The 10 free conversions are lifetime by default** (configurable to
  monthly via `FREE_QUOTA_PERIOD`). Lifetime creates a hard paywall that
  converts better; monthly retains casual users and their SEO signals. Launch
  with lifetime, A/B test monthly at month 3.

**Phase-2 pricing experiments**: a $4.99 one-off "10-pack" for people who
refuse subscriptions; a 24-hour pass at $2.99 (Online-Convert does this
well); a regional price for Georgia/CIS.

## 7. Go-to-market

1. **Programmatic SEO** (the engine). One page per pair, unique copy per pair
   (what the formats are, why you'd convert, quality notes, FAQ), HowTo
   JSON-LD, related pairs, sitemap. Start with the long tail (`ogv to mp4`,
   `fb2 to epub`) where domain authority is not required, then climb. Target:
   500 indexed pair pages by month 3, 2,000 by month 6 (with localisation).
2. **Adjacent tool pages** with the same infra: compress PDF, compress video,
   resize image, extract audio. These are separate high-volume queries and
   double the SEO surface at low cost.
3. **Localisation first-mover**: Georgian, Russian, Turkish, Ukrainian,
   Armenian pair pages. Low competition, founder advantage, and Georgian
   Stripe/Paddle payouts are straightforward.
4. **Launch moments**: Product Hunt, Hacker News ("Show HN: a file converter
   with no ads and one honest limit"), r/InternetIsBeautiful, r/DataHoarder,
   r/Kindle (ebook conversions), IndieHackers build-log.
5. **Referral**: +5 free conversions per friend who signs up (cheap, viral,
   easy to implement on top of the quota model).
6. **Developer API** with clean docs and a generous free key on Pro. CloudConvert
   proves developers pay; the Business tier exists for them.
7. **Content**: "What is HEIC and why does Windows hate it" style explainers,
   each linking to the relevant pair pages.

Paid acquisition is deliberately **not** in the plan for year one: CPCs on
converter keywords are high and the conversion rate to paid is too low for
ads to pay back.

## 8. Unit economics

Marginal cost per conversion is small; the business is about traffic and
conversion rate.

**Compute** (dominant cost, almost entirely video/audio):

- A Hetzner CPX41 (8 vCPU, 16 GB) is about €30/month and yields roughly
  20M vCPU-seconds/month; at a realistic 40% utilisation that is
  ~8M vCPU-seconds.
- An average job (weighted across categories) uses ~20 vCPU-seconds; a 1080p
  video transcode of a 5-minute clip uses ~300.
- One such worker box therefore handles roughly **400k average conversions
  per month**, i.e. **≈ €0.0001 per conversion**, or about €0.001 for a
  typical video.

**Storage & bandwidth**: average file 25 MB in + 20 MB out, retained 2 h–30
days. Cloudflare R2 (no egress fees) at $0.015/GB-month makes storage
negligible; Hetzner includes 20 TB/month egress per box. Budget
**$50–150/month** at 300k conversions/month.

**Third-party**: Stripe/Paddle ~3–5% of revenue; domain, email (Resend),
error tracking, uptime — under $50/month.

**Fixed**: founder time. No salaries assumed in year one.

**Funnel assumptions** (industry benchmarks for freemium utilities):

| Step | Rate |
| --- | --- |
| Visitor → starts a conversion | 30–40% |
| Free user who exhausts 10 conversions → subscribes | 3–6% |
| Overall visitor → paying subscriber | 0.1–0.3% |
| Blended ARPU (mix of tiers, monthly/yearly) | ~$11 / month |
| Monthly churn | 8–12% (utility SaaS is churny; yearly plans offset it) |

**Scenarios at steady state**

| | Conservative | Base | Optimistic |
| --- | --- | --- | --- |
| Monthly visitors | 150k | 500k | 1.5M |
| Conversions / month | 50k | 175k | 500k |
| Paying subscribers (stock) | 250 | 1,200 | 4,500 |
| MRR | $2.7k | $13k | $50k |
| Infra & tools / month | $200 | $600 | $2,000 |
| Payment fees / month | $110 | $550 | $2,100 |
| **Gross margin** | ~88% | ~91% | ~92% |

Infra break-even is around **30 paying subscribers**. A comfortable solo
salary is the Base scenario, which corresponds to ~0.5% of the incumbents'
combined traffic.

## 9. 12-month plan and milestones

| Month | Milestone | Success metric |
| --- | --- | --- |
| 0 (now) | Repo, brand, business plan, MVP scaffold (this repo) | Builds & runs locally |
| 1 | MVP live on a single Hetzner box: converter, 10-free quota, pricing, Stripe/Paddle, 45 popular pair pages | First real conversion by a stranger |
| 2 | All 200+ pair pages, sitemap, analytics (Plausible), error tracking, legal pages; Product Hunt / HN launch | 10k visits, first 10 paying |
| 3 | Batch + ZIP, compress/resize tools, referral bonus; A/B test monthly reset | 30k visits/mo, 50 paying |
| 4–5 | Localised pages (ka, ru, tr, uk, hy); PDF tools (merge/split/compress) | 80k visits/mo, 150 paying |
| 6 | Public REST API + docs, API keys in dashboard, webhooks for Business | 150k visits/mo, 300 paying, first API customer |
| 7–9 | OCR add-on, Drive/Dropbox import, Chrome extension, presets | 300k visits/mo, 700 paying |
| 10–12 | Team seats, invoices/VAT, SOC-lite security page, second worker region | 500k visits/mo, 1,200 paying (~$13k MRR) |

## 10. Legal, payments and compliance

- **Entity & payments (important for a Georgia-based founder)**: Stripe does
  not onboard Georgian companies directly. Options: (a) **Paddle** or
  **Lemon Squeezy** as merchant of record — they handle global VAT/sales tax
  and pay out to Georgian bank accounts, at ~5% + fees; (b) a US LLC via
  Stripe Atlas or an Estonian e-Residency company, then Stripe directly at
  ~3%. Recommendation: launch on Paddle to avoid tax admin, revisit at
  ~$10k MRR. The code isolates billing behind `apps/api/src/billing/` so the
  swap is contained.
- **Privacy**: GDPR applies to EU visitors. Files are processed only to
  perform the conversion, encrypted at rest, deleted on the retention
  schedule, never used for training or analytics. Publish a data-processing
  page. Use a cookieless analytics tool (Plausible) to avoid consent banners.
- **Terms**: user warrants they own or have rights to the files; no
  processing of illegal content; DMCA agent registered; abuse reporting
  address.
- **Explicitly out of scope**: downloading from YouTube or other platforms
  ("youtube to mp3"). It is the biggest query in the space and the fastest
  way to a DMCA takedown and a Stripe/Paddle ban. Anyform converts files the
  user already has. Say so on the FAQ.
- **Trademark/domain**: check `anyform.app`, `anyform.io`, `getanyform.com`
  and file a trademark search before spending on brand. Fallback names are in
  `BRAND.md`.

## 11. Risks and mitigations

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Google algorithm update wipes out programmatic pages | Medium | Unique per-pair copy (not templated boilerplate), real HowTo content, fast Core Web Vitals, diversify into tools pages and localisation |
| Free-tier abuse (clearing cookies, scripted uploads) | High | Guest quota is cookie + IP-hash rate limit; require email verification after N guest conversions from the same IP; per-IP concurrency cap |
| Video costs spike from a viral moment | Medium | Free tier hard cap at 100 MB & 1 concurrent; per-job CPU/time limits; autoscale worker count |
| Malware / illegal content uploaded | Medium | Never execute inputs; sandboxed workers; short retention; hash-match known CSAM lists (PhotoDNA-style) in phase 2; abuse contact |
| Incumbent copies "no ads, 10 free" positioning | Low | They are ad-revenue dependent; the brand and speed moat compounds over time |
| Payment provider suspension | Low | Stay far from grey-area conversions (no URL downloads), clear ToS, low chargeback rate |
| Solo founder bandwidth | High | Boring, well-documented stack; everything in one repo; managed Postgres; alerting from day one |

## 12. KPIs to watch weekly

- Organic visits and indexed pair pages
- Conversion start rate (visitor → first conversion)
- Free-quota exhaustion rate and paywall conversion rate
- MRR, new subs, churn, yearly share
- P50/P95 job duration by category; failure rate by engine
- Cost per 1,000 conversions

## 13. What success looks like in 24 months

A recognisable brand ("the clean converter"), 1M+ monthly visitors, ~$40k
MRR, ~93% gross margin, run by two people, with a developer API generating a
growing share of revenue and a defensible position in five non-English
markets. At that point the options are: keep it as a very profitable lifestyle
business, hire to attack the API/enterprise segment, or sell — utility SaaS
with organic traffic sells for 3–5x ARR.
