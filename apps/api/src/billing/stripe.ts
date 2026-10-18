import Stripe from "stripe";
import type { User } from "@prisma/client";
import { isOneTimeProductId, isPlanId, type BillingInterval, type PlanId } from "@anyform/shared";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { errors } from "../errors.js";
import { applySnapshot, grantPurchase } from "./apply.js";
import { PriceMap } from "./prices.js";
import type { BillingProvider, CheckoutItem, SubscriptionSnapshot } from "./provider.js";

/** Stripe moved current_period_* to subscription items in the 2025 "basil" API; read either. */
function periodEnd(sub: Stripe.Subscription): Date {
  const item = sub.items?.data?.[0] as unknown as { current_period_end?: number } | undefined;
  const legacy = (sub as unknown as { current_period_end?: number }).current_period_end;
  const ts = item?.current_period_end ?? legacy ?? Math.floor(Date.now() / 1000) + 30 * 86400;
  return new Date(ts * 1000);
}

function idOf(ref: string | { id: string } | null | undefined): string | undefined {
  if (!ref) return undefined;
  return typeof ref === "string" ? ref : ref.id;
}

/**
 * Stripe Checkout + Customer Portal. Not usable by a Georgia-registered business
 * (Georgia is not a Stripe country); kept for a foreign entity (e.g. a US LLC).
 */
export class StripeBilling implements BillingProvider {
  readonly name = "stripe" as const;
  private readonly stripe: Stripe;
  private readonly prices: PriceMap;

  constructor(secretKey: string, private readonly webhookSecret: string | undefined) {
    this.stripe = new Stripe(secretKey);
    this.prices = new PriceMap("STRIPE", config as unknown as Record<string, unknown>);
  }

  private async ensureCustomer(user: User): Promise<string> {
    if (user.stripeCustomerId) return user.stripeCustomerId;
    const customer = await this.stripe.customers.create({
      email: user.email,
      name: user.name ?? undefined,
      metadata: { userId: user.id },
    });
    await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customer.id } });
    return customer.id;
  }

  async createCheckout(user: User, item: CheckoutItem): Promise<string> {
    const price = this.prices.idFor(item);
    if (!price) throw errors.billingUnavailable();
    const customer = await this.ensureCustomer(user);
    const common = {
      customer,
      line_items: [{ price, quantity: 1 }],
      allow_promotion_codes: true,
      client_reference_id: user.id,
      success_url: `${config.WEB_ORIGIN}/dashboard?checkout=success`,
      cancel_url: `${config.WEB_ORIGIN}/pricing?checkout=cancelled`,
    };
    const session =
      item.kind === "subscription"
        ? await this.stripe.checkout.sessions.create({
            ...common,
            mode: "subscription",
            subscription_data: { metadata: { userId: user.id, plan: item.plan, interval: item.interval } },
          })
        : await this.stripe.checkout.sessions.create({ ...common, mode: "payment", metadata: { userId: user.id, product: item.product } });
    if (!session.url) throw errors.internal("Stripe did not return a checkout URL.");
    return session.url;
  }

  async createPortal(user: User): Promise<string> {
    const customer = await this.ensureCustomer(user);
    const session = await this.stripe.billingPortal.sessions.create({
      customer,
      return_url: `${config.WEB_ORIGIN}/dashboard`,
    });
    return session.url;
  }

  async handleWebhook(rawBody: Buffer, headers: Record<string, string | undefined>): Promise<{ type: string; handled: boolean }> {
    if (!this.webhookSecret) throw errors.billingUnavailable();
    const signature = headers["stripe-signature"];
    if (!signature) throw errors.validation("Missing Stripe-Signature header.");
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch (err) {
      throw errors.validation(`Invalid webhook signature: ${(err as Error).message}`);
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode === "payment") {
          const product = session.metadata?.product;
          const userId = session.metadata?.userId ?? session.client_reference_id ?? undefined;
          if (session.payment_status !== "paid" || !isOneTimeProductId(product) || !userId) return { type: event.type, handled: false };
          await grantPurchase({ userId, provider: "stripe", providerTransactionId: session.id, product });
          return { type: event.type, handled: true };
        }
        const subId = idOf(session.subscription as string | Stripe.Subscription | null);
        if (!subId) return { type: event.type, handled: false };
        const sub = await this.stripe.subscriptions.retrieve(subId);
        await this.applySubscription(sub, session.client_reference_id ?? undefined);
        return { type: event.type, handled: true };
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await this.applySubscription(event.data.object);
        return { type: event.type, handled: true };
      }
      default:
        return { type: event.type, handled: false };
    }
  }

  private async resolveUserId(sub: Stripe.Subscription, hint?: string): Promise<string | undefined> {
    const fromMeta = sub.metadata?.userId;
    if (fromMeta) return fromMeta;
    if (hint) return hint;
    const customerId = idOf(sub.customer as string | Stripe.Customer);
    if (!customerId) return undefined;
    const user = await prisma.user.findUnique({ where: { stripeCustomerId: customerId }, select: { id: true } });
    return user?.id;
  }

  private snapshot(sub: Stripe.Subscription, userId: string): SubscriptionSnapshot | undefined {
    const priceId = sub.items?.data?.[0]?.price?.id;
    if (!priceId) return undefined;
    const found = this.prices.lookup(priceId);
    const entry = found?.kind === "subscription" ? found : undefined;
    const metaPlan = sub.metadata?.plan;
    const plan: PlanId = entry?.plan ?? (isPlanId(metaPlan) ? metaPlan : "free");
    const interval: BillingInterval =
      entry?.interval ?? (sub.items?.data?.[0]?.price?.recurring?.interval === "year" ? "year" : "month");
    return {
      userId,
      providerSubscriptionId: sub.id,
      providerPriceId: priceId,
      plan,
      interval,
      status: sub.status,
      currentPeriodEnd: periodEnd(sub),
      cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    };
  }

  /** Upsert the Subscription row and denormalise User.plan (§10). */
  async applySubscription(sub: Stripe.Subscription, userIdHint?: string): Promise<void> {
    const userId = await this.resolveUserId(sub, userIdHint);
    if (!userId) return;
    const snap = this.snapshot(sub, userId);
    if (!snap) return;
    await applySnapshot(snap);
  }
}
