import type { BillingInterval, OneTimeProductId, PlanId } from "@anyform/shared";
import type { User } from "@prisma/client";

/**
 * Billing is behind this interface so Stripe can be swapped for a
 * merchant-of-record (Paddle, Lemon Squeezy) without touching routes.
 */
/** What the customer is buying. */
export type CheckoutItem =
  | { kind: "subscription"; plan: Exclude<PlanId, "free">; interval: BillingInterval }
  | { kind: "one_time"; product: OneTimeProductId };

export interface BillingProvider {
  readonly name: "stripe" | "paddle";
  /** URL that opens checkout for a subscription or a one-time product. */
  createCheckout(user: User, item: CheckoutItem): Promise<string>;
  /** Hosted self-service portal (change plan, update card, cancel, invoices). */
  createPortal(user: User): Promise<string>;
  /**
   * Verify and process a webhook. Implementations update `Subscription`,
   * denormalise `User.plan` and grant one-time purchases (billing/apply.ts).
   * Returns the event type handled (for logging).
   */
  handleWebhook(rawBody: Buffer, headers: Record<string, string | undefined>): Promise<{ type: string; handled: boolean }>;
}

export interface SubscriptionSnapshot {
  userId: string;
  providerSubscriptionId: string;
  providerPriceId: string;
  plan: PlanId;
  interval: BillingInterval;
  status: string;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
}

/** Statuses that grant paid features (§10). */
export const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export function effectivePlan(snapshot: Pick<SubscriptionSnapshot, "plan" | "status">): PlanId {
  return ACTIVE_STATUSES.has(snapshot.status) ? snapshot.plan : "free";
}
