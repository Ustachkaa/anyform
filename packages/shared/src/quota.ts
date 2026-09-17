import { getPlan, type PlanId } from "./plans.js";

/**
 * Free-tier quota rules.
 *
 * The product promise is simple: every visitor gets N free conversions (default
 * 10). Guests are tracked by a signed cookie; when a guest signs up, their
 * conversions are re-attributed to the new account so the count carries over.
 * Paid plans have no conversion count limit — they are limited by file size,
 * concurrency and retention instead.
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
  /** null when unlimited. */
  remaining: number | null;
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

export function computeQuota(plan: PlanId, used: number, cfg: QuotaConfig = DEFAULT_QUOTA, now = new Date()): QuotaState {
  const p = getPlan(plan);
  if (p.id !== "free") {
    return { plan: p.id, used, limit: null, remaining: null, exhausted: false, period: cfg.period, resetsAt: null };
  }
  const limit = Math.max(0, cfg.freeConversions);
  const remaining = Math.max(0, limit - used);
  return {
    plan: "free",
    used,
    limit,
    remaining,
    exhausted: remaining <= 0,
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
