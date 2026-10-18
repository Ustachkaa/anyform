import { getPlan, type PlanId } from "./plans.js";

/**
 * Free-tier quota rules.
 *
 * The product promise is simple: every visitor gets N free conversions (default
 * 10). Guests are tracked by a signed cookie; when a guest signs up, their
 * conversions are re-attributed to the new account so the count carries over.
 * Paid plans have no conversion count limit — they are limited by file size,
 * concurrency and retention instead. Purchased credits (conversion packs) are
 * spent only once the free allowance is used up, and never expire; a 24-hour
 * pass makes the account count as a paid plan while it lasts.
 */

export type QuotaPeriod = "lifetime" | "monthly";

export interface QuotaConfig {
  freeConversions: number;
  period: QuotaPeriod;
}

export const DEFAULT_QUOTA: QuotaConfig = { freeConversions: 10, period: "lifetime" };

export interface QuotaState {
  plan: PlanId;
  /** Conversions counted against the free allowance in the current period. */
  used: number;
  /** null when unlimited (any paid plan). */
  limit: number | null;
  /** Free conversions left; null when unlimited. */
  remaining: number | null;
  /** Purchased conversion credits left (spent after the free allowance). */
  credits: number;
  /** End of an active 24-hour pass (ISO), else null. */
  passUntil: string | null;
  /** True when neither free conversions nor credits are left (never on a paid plan or pass). */
  exhausted: boolean;
  period: QuotaPeriod;
  /** ISO date at which the count resets (monthly period only). */
  resetsAt: string | null;
}

/** Start of the current calendar month (UTC) — the monthly reset boundary. */
export function monthlyPeriodStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function nextMonthlyReset(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

export interface QuotaExtras {
  credits?: number;
  passUntil?: Date | null;
}

export function computeQuota(
  plan: PlanId,
  used: number,
  cfg: QuotaConfig = DEFAULT_QUOTA,
  now = new Date(),
  extras: QuotaExtras = {},
): QuotaState {
  const p = getPlan(plan);
  const credits = Math.max(0, extras.credits ?? 0);
  const passUntil = extras.passUntil && extras.passUntil.getTime() > now.getTime() ? extras.passUntil.toISOString() : null;
  if (p.id !== "free") {
    return { plan: p.id, used, limit: null, remaining: null, credits, passUntil, exhausted: false, period: cfg.period, resetsAt: null };
  }
  const limit = Math.max(0, cfg.freeConversions);
  const remaining = Math.max(0, limit - used);
  return {
    plan: "free",
    used,
    limit,
    remaining,
    credits,
    passUntil,
    exhausted: remaining <= 0 && credits <= 0,
    period: cfg.period,
    resetsAt: cfg.period === "monthly" ? nextMonthlyReset(now).toISOString() : null,
  };
}

export interface SizeCheck {
  ok: boolean;
  maxBytes: number;
}

export function checkFileSize(plan: PlanId, bytes: number): SizeCheck {
  const max = getPlan(plan).maxFileBytes;
  return { ok: bytes <= max, maxBytes: max };
}
