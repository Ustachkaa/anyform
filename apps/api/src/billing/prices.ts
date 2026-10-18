import type { BillingInterval, OneTimeProductId, PlanId } from "@anyform/shared";
import type { CheckoutItem } from "./provider.js";

/**
 * Provider price id ↔ what it sells, built from env (`<PREFIX>_PRICE_*`).
 * Both providers use the same naming, so this is shared.
 */

export type PriceEntry =
  | { kind: "subscription"; plan: Exclude<PlanId, "free">; interval: BillingInterval }
  | { kind: "one_time"; product: OneTimeProductId };

const KEYS: Array<[string, PriceEntry]> = [
  ["STARTER_MONTHLY", { kind: "subscription", plan: "starter", interval: "month" }],
  ["STARTER_YEARLY", { kind: "subscription", plan: "starter", interval: "year" }],
  ["PRO_MONTHLY", { kind: "subscription", plan: "pro", interval: "month" }],
  ["PRO_YEARLY", { kind: "subscription", plan: "pro", interval: "year" }],
  ["BUSINESS_MONTHLY", { kind: "subscription", plan: "business", interval: "month" }],
  ["BUSINESS_YEARLY", { kind: "subscription", plan: "business", interval: "year" }],
  ["PACK", { kind: "one_time", product: "pack" }],
  ["PASS", { kind: "one_time", product: "pass" }],
];

export class PriceMap {
  private readonly byId = new Map<string, PriceEntry>();

  constructor(prefix: "STRIPE" | "PADDLE", env: Record<string, unknown>) {
    for (const [suffix, entry] of KEYS) {
      const id = env[`${prefix}_PRICE_${suffix}`];
      if (typeof id === "string" && id) this.byId.set(id, entry);
    }
  }

  lookup(priceId: string | undefined | null): PriceEntry | undefined {
    return priceId ? this.byId.get(priceId) : undefined;
  }

  /** The configured price id for an item, or undefined if that item isn't set up. */
  idFor(item: CheckoutItem): string | undefined {
    for (const [id, e] of this.byId) {
      if (item.kind === "subscription" && e.kind === "subscription" && e.plan === item.plan && e.interval === item.interval) return id;
      if (item.kind === "one_time" && e.kind === "one_time" && e.product === item.product) return id;
    }
    return undefined;
  }
}
