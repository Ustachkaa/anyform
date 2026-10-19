import { z } from "zod";
import type { QuotaConfig } from "@anyform/shared";

/**
 * Environment configuration, parsed once at import time.
 *
 * Every variable in `.env.example` is represented here. Values that are still
 * placeholders (ending in "...") or empty strings are treated as unset, and
 * trailing `# comments` are stripped so `.env.example` can be copied verbatim.
 */

function clean(v: string | undefined): string | undefined {
  if (v === undefined) return undefined;
  const stripped = v.replace(/\s+#.*$/, "").trim();
  if (stripped === "" || /\.\.\.$/.test(stripped)) return undefined;
  return stripped;
}

const raw: Record<string, string | undefined> = {};
for (const [k, v] of Object.entries(process.env)) raw[k] = clean(v);

const bool = z
  .string()
  .optional()
  .transform((v) => (v === undefined ? undefined : ["1", "true", "yes", "on"].includes(v.toLowerCase())));

const optStr = z.string().optional();

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: z.string().default("postgresql://anyform:anyform@localhost:5432/anyform"),

  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_HOST: z.string().default("0.0.0.0"),
  API_PUBLIC_URL: z.string().default("http://localhost:4000"),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  /**
   * Proxies whose X-Forwarded-For is believed (proxy-addr syntax). The client IP
   * drives rate limits and guest throttles, so trusting every sender let anyone
   * fake their IP. Default: loopback and private networks (Next.js rewrite,
   * Caddy and Docker networks), never the public internet.
   */
  TRUST_PROXY: z.string().default("loopback,linklocal,uniquelocal"),
  JWT_SECRET: z.string().default("dev-only-jwt-secret-change-me-please"),
  COOKIE_SECRET: z.string().default("dev-only-cookie-secret-change-me-please"),
  COOKIE_DOMAIN: optStr,

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./data"),
  S3_ENDPOINT: optStr,
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("anyform"),
  S3_ACCESS_KEY: optStr,
  S3_SECRET_KEY: optStr,
  S3_FORCE_PATH_STYLE: bool.default("true"),

  FREE_CONVERSIONS: z.coerce.number().int().min(0).default(10),
  FREE_QUOTA_PERIOD: z.enum(["lifetime", "monthly"]).default("lifetime"),
  GUEST_UPLOADS_PER_HOUR: z.coerce.number().int().min(1).default(20),
  GLOBAL_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(100),

  FFMPEG_PATH: optStr,
  SOFFICE_PATH: optStr,
  PANDOC_PATH: optStr,
  CALIBRE_PATH: optStr,
  PDFTOPPM_PATH: optStr,
  PDFTOTEXT_PATH: optStr,
  PDFTOHTML_PATH: optStr,
  MAGICK_PATH: optStr,
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(2),
  JOB_TIMEOUT_MS: z.coerce.number().int().min(10_000).default(900_000),
  CLEANUP_CRON: z.string().default("*/10 * * * *"),

  STRIPE_SECRET_KEY: optStr,
  STRIPE_WEBHOOK_SECRET: optStr,
  STRIPE_PRICE_STARTER_MONTHLY: optStr,
  STRIPE_PRICE_STARTER_YEARLY: optStr,
  STRIPE_PRICE_PRO_MONTHLY: optStr,
  STRIPE_PRICE_PRO_YEARLY: optStr,
  STRIPE_PRICE_BUSINESS_MONTHLY: optStr,
  STRIPE_PRICE_BUSINESS_YEARLY: optStr,
  STRIPE_PRICE_PACK: optStr,
  STRIPE_PRICE_PASS: optStr,

  // Which provider takes payments. Unset: Paddle if PADDLE_API_KEY is set, else Stripe if STRIPE_SECRET_KEY is.
  BILLING_PROVIDER: z.enum(["paddle", "stripe"]).optional(),
  PADDLE_API_KEY: optStr,
  PADDLE_WEBHOOK_SECRET: optStr,
  PADDLE_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  PADDLE_PRICE_STARTER_MONTHLY: optStr,
  PADDLE_PRICE_STARTER_YEARLY: optStr,
  PADDLE_PRICE_PRO_MONTHLY: optStr,
  PADDLE_PRICE_PRO_YEARLY: optStr,
  PADDLE_PRICE_BUSINESS_MONTHLY: optStr,
  PADDLE_PRICE_BUSINESS_YEARLY: optStr,
  PADDLE_PRICE_PACK: optStr,
  PADDLE_PRICE_PASS: optStr,

  // Transactional email (password reset). "log" prints the message instead of sending it.
  MAIL_DRIVER: z.enum(["log", "resend"]).default("log"),
  MAIL_FROM: z.string().default("Anyform <no-reply@anyform.app>"),
  RESEND_API_KEY: optStr,
});

const parsed = schema.safeParse(raw);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;

export const isProd = config.NODE_ENV === "production";
export const isTest = config.NODE_ENV === "test";

if (isProd) {
  const weak = [
    ["JWT_SECRET", config.JWT_SECRET],
    ["COOKIE_SECRET", config.COOKIE_SECRET],
  ].filter(([, v]) => !v || v.length < 32 || v.startsWith("dev-only"));
  if (weak.length) {
    // eslint-disable-next-line no-console
    console.error(`Refusing to start in production with weak secrets: ${weak.map(([k]) => k).join(", ")}`);
    process.exit(1);
  }
}

export const quotaConfig: QuotaConfig = {
  freeConversions: config.FREE_CONVERSIONS,
  period: config.FREE_QUOTA_PERIOD,
};

export const stripeConfigured = Boolean(config.STRIPE_SECRET_KEY);
