import type { BillingInterval, PlanId } from "@anyform/shared";
import type { User } from "@prisma/client";

/**
 * Billing is behind this interface so Stripe can be swapped for a
 * merchant-of-record (Paddle, Lemon Squeezy) without touching routes.
 */
export interface BillingProvider {
  readonly name: string;
  /** Hosted checkout for a new subscription. */
  createCheckout(user: User, plan: Exclude<PlanId, "free">, interval: BillingInterval): Promise<string>;
  /** Hosted self-service portal (change plan, update card, cancel). */
  createPortal(user: User): Promise<string>;
  /**
   * Verify and process a webhook. Implementations update `Subscription` and
   * denormalise `User.plan`. Returns the event type handled (for logging).
   */
  handleWebhook(rawBody: Buffer, signature: string | undefined): Promise<{ type: string; handled: boolean }>;
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
