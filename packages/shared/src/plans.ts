/**
 * Subscription plans. Prices are in USD. Stripe price IDs are mapped to these
 * ids via environment variables in the API — never hard-code them here.
 */

export type PlanId = "free" | "starter" | "pro" | "business";
export type BillingInterval = "month" | "year";

export const MB = 1024 * 1024;
export const GB = 1024 * MB;

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  /** Monthly price when billed monthly. */
  priceMonthly: number;
  /** Effective monthly price when billed yearly (charged as 12x this). */
  priceYearlyPerMonth: number;
  /** Max size of a single uploaded file. */
  maxFileBytes: number;
  /** Jobs that may run at the same time for this account. */
  concurrentJobs: number;
  /** How long outputs stay downloadable. */
  retentionHours: number;
  /** Files per batch upload. */
  batchSize: number;
  /** Queue priority (higher runs first). */
  priority: number;
  /** REST API calls per month; 0 = no API access. */
  apiCallsPerMonth: number;
  /** Team seats sharing one subscription. */
  seats: number;
  /** Marketing bullets shown on the pricing page. */
  features: readonly string[];
  /** Highlight as the recommended plan. */
  highlight?: boolean;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    tagline: "Try it properly. No card, no ads.",
    priceMonthly: 0,
    priceYearlyPerMonth: 0,
    maxFileBytes: 100 * MB,
    concurrentJobs: 1,
    retentionHours: 2,
    batchSize: 1,
    priority: 0,
    apiCallsPerMonth: 0,
    seats: 1,
    features: [
      "10 free conversions",
      "Files up to 100 MB",
      "All 200+ format pairs",
      "Downloads kept for 2 hours",
      "No ads. Ever.",
    ],
  },
  starter: {
    id: "starter",
    name: "Starter",
    tagline: "For the occasional big file.",
    priceMonthly: 7.99,
    priceYearlyPerMonth: 5.99,
    maxFileBytes: 500 * MB,
    concurrentJobs: 2,
    retentionHours: 24,
    batchSize: 10,
    priority: 1,
    apiCallsPerMonth: 0,
    seats: 1,
    features: [
      "Unlimited conversions",
      "Files up to 500 MB",
      "Batch up to 10 files",
      "2 conversions at once",
      "Downloads kept for 24 hours",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "For people who convert every day.",
    priceMonthly: 14.99,
    priceYearlyPerMonth: 11.99,
    maxFileBytes: 2 * GB,
    concurrentJobs: 5,
    retentionHours: 24 * 7,
    batchSize: 100,
    priority: 2,
    apiCallsPerMonth: 1000,
    seats: 1,
    highlight: true,
    features: [
      "Everything in Starter",
      "Files up to 2 GB",
      "Batch up to 100 files",
      "5 conversions at once, priority queue",
      "Downloads kept for 7 days",
      "REST API — 1,000 calls / month",
    ],
  },
  business: {
    id: "business",
    name: "Business",
    tagline: "For teams and automated pipelines.",
    priceMonthly: 29.99,
    priceYearlyPerMonth: 23.99,
    maxFileBytes: 5 * GB,
    concurrentJobs: 20,
    retentionHours: 24 * 30,
    batchSize: 500,
    priority: 3,
    apiCallsPerMonth: 25000,
    seats: 5,
    features: [
      "Everything in Pro",
      "Files up to 5 GB",
      "Batch up to 500 files",
      "20 conversions at once, top priority",
      "Downloads kept for 30 days",
      "REST API — 25,000 calls / month + webhooks",
      "5 team seats",
    ],
  },
};

/**
 * One-time purchases for people who won't subscribe. Prices in USD; provider
 * price IDs come from env (PADDLE_PRICE_PACK / _PASS, STRIPE_PRICE_PACK / _PASS).
 */
export type OneTimeProductId = "pack" | "pass";

export interface OneTimeProduct {
  id: OneTimeProductId;
  name: string;
  tagline: string;
  price: number;
  /** Conversions added to the account's credit balance (pack). Credits never expire. */
  credits?: number;
  /** Hours of the `grantsPlan` limits (pass). Buying again while active extends it. */
  hours?: number;
  grantsPlan?: Exclude<PlanId, "free">;
  features: readonly string[];
}

export const ONE_TIME_PRODUCTS: Record<OneTimeProductId, OneTimeProduct> = {
  pack: {
    id: "pack",
    name: "Conversion pack",
    tagline: "Pay once. No subscription.",
    price: 4.99,
    credits: 20,
    features: ["20 conversions", "Never expire", "Used after your free 10", "Files up to 100 MB"],
  },
  pass: {
    id: "pass",
    name: "24-hour pass",
    tagline: "A big day of converting.",
    price: 2.99,
    hours: 24,
    grantsPlan: "starter",
    features: ["Unlimited conversions for 24 hours", "Starter limits: 500 MB files, 2 at once", "Starts when you pay", "No renewal"],
  },
};

export function isOneTimeProductId(v: unknown): v is OneTimeProductId {
  return v === "pack" || v === "pass";
}

export const PLAN_ORDER: readonly PlanId[] = ["free", "starter", "pro", "business"];
export const PAID_PLANS: readonly PlanId[] = ["starter", "pro", "business"];

export function isPlanId(v: unknown): v is PlanId {
  return typeof v === "string" && Object.hasOwn(PLANS, v);
}

export function isPaidPlan(id: PlanId): boolean {
  return id !== "free";
}

export function getPlan(id: string | undefined | null): Plan {
  return isPlanId(id) ? PLANS[id] : PLANS.free;
}

/** Yearly total charged up front, in USD. */
export function yearlyTotal(plan: Plan): number {
  return Math.round(plan.priceYearlyPerMonth * 12 * 100) / 100;
}

/** Percentage saved by paying yearly, rounded. */
export function yearlySavingsPct(plan: Plan): number {
  if (plan.priceMonthly === 0) return 0;
  return Math.round((1 - plan.priceYearlyPerMonth / plan.priceMonthly) * 100);
}
