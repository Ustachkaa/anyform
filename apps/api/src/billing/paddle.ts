import { createHmac, timingSafeEqual } from "node:crypto";
import type { User } from "@prisma/client";
import type { BillingInterval } from "@anyform/shared";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { errors } from "../errors.js";
import { applySnapshot, grantPurchase } from "./apply.js";
import { PriceMap } from "./prices.js";
import type { BillingProvider, CheckoutItem, SubscriptionSnapshot } from "./provider.js";

/**
 * Paddle Billing as merchant of record: Paddle sells to the customer, collects
 * and remits VAT / US sales tax, and pays out to the seller (wire/Payoneer),
 * which works for a Georgia-based business where Stripe does not.
 *
 * Checkout: the API creates a transaction and returns `${WEB_ORIGIN}/checkout?_ptxn=<id>`;
 * that page opens Paddle.js's overlay for the transaction.
 */

const API_BASE = { sandbox: "https://sandbox-api.paddle.com", production: "https://api.paddle.com" } as const;
/** Reject webhooks whose signed timestamp is older than this (replay protection). */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

interface PaddleSubscription {
  id: string;
  status: string;
  customer_id: string;
  custom_data?: Record<string, unknown> | null;
  items?: Array<{ price?: { id?: string; billing_cycle?: { interval?: string } | null } | null }>;
  billing_cycle?: { interval?: string } | null;
  current_billing_period?: { ends_at?: string | null } | null;
  scheduled_change?: { action?: string; effective_at?: string | null } | null;
  canceled_at?: string | null;
}

interface PaddleTransaction {
  id: string;
  status: string;
  customer_id: string | null;
  subscription_id?: string | null;
  custom_data?: Record<string, unknown> | null;
  items?: Array<{ price?: { id?: string } | null; price_id?: string }>;
}

interface PaddleEvent {
  event_id: string;
  event_type: string;
  occurred_at?: string;
  data: unknown;
}

/**
 * Check a `Paddle-Signature` header (`ts=…;h1=…[;h1=…]`): HMAC-SHA256 over
 * `${ts}:${rawBody}` with the destination's secret. Any h1 may match (secret rotation).
 */
export function verifyPaddleSignature(rawBody: Buffer, header: string | undefined, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  if (!header) return false;
  let ts: string | undefined;
  const sigs: string[] = [];
  for (const part of header.split(";")) {
    const [k, v] = part.split("=", 2).map((x) => x?.trim());
    if (k === "ts") ts = v;
    else if (k === "h1" && v) sigs.push(v);
  }
  if (!ts || !/^\d+$/.test(ts) || sigs.length === 0) return false;
  if (Math.abs(nowSeconds - Number(ts)) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = createHmac("sha256", secret).update(`${ts}:`).update(rawBody).digest();
  return sigs.some((s) => {
    if (!/^[0-9a-f]+$/i.test(s)) return false;
    const got = Buffer.from(s, "hex");
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

export class PaddleBilling implements BillingProvider {
  readonly name = "paddle" as const;
  private readonly base: string;
  private readonly prices: PriceMap;

  constructor(
    private readonly apiKey: string,
    private readonly webhookSecret: string | undefined,
    env: "sandbox" | "production" = config.PADDLE_ENV,
    priceEnv: Record<string, unknown> = config as unknown as Record<string, unknown>,
  ) {
    this.base = API_BASE[env];
    this.prices = new PriceMap("PADDLE", priceEnv);
  }

  private async api<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<{ status: number; data: T; error?: { code?: string; detail?: string } }> {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as { data?: T; error?: { code?: string; detail?: string } };
    return { status: res.status, data: json.data as T, error: json.error };
  }

  /** The Paddle customer for this user, created on first checkout (or found by email if it already exists). */
  async ensureCustomer(user: User): Promise<string> {
    if (user.paddleCustomerId) return user.paddleCustomerId;
    const created = await this.api<{ id: string }>("POST", "/customers", { email: user.email, name: user.name ?? undefined, custom_data: { userId: user.id } });
    let id = created.status < 300 ? created.data?.id : undefined;
    if (!id && created.status === 409) {
      // Adopt the existing customer only if we made it for this same user (a lost write).
      // Emails are not verified, so matching on email alone would hand one account
      // another person's Paddle customer, portal and invoices.
      const found = await this.api<Array<{ id: string; custom_data?: Record<string, unknown> | null }>>(
        "GET",
        `/customers?email=${encodeURIComponent(user.email)}`,
      );
      id = found.data?.find((c) => asString(c.custom_data?.userId) === user.id)?.id;
      if (!id) throw errors.conflict("This email is already linked to a different billing account. Contact support.");
    }
    if (!id) throw errors.internal(`Paddle could not create a customer (${created.error?.code ?? created.status}).`);
    await prisma.user.update({ where: { id: user.id }, data: { paddleCustomerId: id } });
    return id;
  }

  async createCheckout(user: User, item: CheckoutItem): Promise<string> {
    const priceId = this.prices.idFor(item);
    if (!priceId) throw errors.billingUnavailable();
    const customerId = await this.ensureCustomer(user);
    const custom_data = { userId: user.id, ...(item.kind === "one_time" ? { product: item.product } : { plan: item.plan, interval: item.interval }) };
    const txn = await this.api<{ id: string }>("POST", "/transactions", {
      items: [{ price_id: priceId, quantity: 1 }],
      customer_id: customerId,
      custom_data,
      collection_mode: "automatic",
    });
    if (txn.status >= 300 || !txn.data?.id) throw errors.internal(`Paddle could not start checkout (${txn.error?.code ?? txn.status}).`);
    return `${config.WEB_ORIGIN.replace(/\/$/, "")}/checkout?_ptxn=${encodeURIComponent(txn.data.id)}`;
  }

  async createPortal(user: User): Promise<string> {
    const customerId = await this.ensureCustomer(user);
    const sub = await prisma.subscription.findUnique({ where: { userId: user.id }, select: { providerSubscriptionId: true } });
    const res = await this.api<{ urls?: { general?: { overview?: string } } }>("POST", `/customers/${encodeURIComponent(customerId)}/portal-sessions`, {
      subscription_ids: sub?.providerSubscriptionId.startsWith("sub_") ? [sub.providerSubscriptionId] : [],
    });
    const url = res.data?.urls?.general?.overview;
    if (res.status >= 300 || !url) throw errors.internal(`Paddle could not open the customer portal (${res.error?.code ?? res.status}).`);
    return url;
  }

  async handleWebhook(rawBody: Buffer, headers: Record<string, string | undefined>): Promise<{ type: string; handled: boolean }> {
    if (!this.webhookSecret) throw errors.billingUnavailable();
    if (!verifyPaddleSignature(rawBody, headers["paddle-signature"], this.webhookSecret)) {
      throw errors.validation("Invalid Paddle-Signature.");
    }
    let event: PaddleEvent;
    try {
      event = JSON.parse(rawBody.toString("utf8")) as PaddleEvent;
    } catch {
      throw errors.validation("Webhook body is not JSON.");
    }
    const type = event.event_type;

    if (type.startsWith("subscription.")) {
      const occurredAt = event.occurred_at ? new Date(event.occurred_at) : undefined;
      const handled = await this.applySubscription(event.data as PaddleSubscription, occurredAt);
      return { type, handled };
    }
    if (type === "transaction.completed") {
      const handled = await this.applyTransaction(event.data as PaddleTransaction);
      return { type, handled };
    }
    return { type, handled: false };
  }

  private async userIdFor(customerId: string | null | undefined, custom: Record<string, unknown> | null | undefined): Promise<string | undefined> {
    const fromCustom = asString(custom?.userId);
    if (fromCustom && (await prisma.user.findUnique({ where: { id: fromCustom }, select: { id: true } }))) return fromCustom;
    if (!customerId) return undefined;
    return (await prisma.user.findUnique({ where: { paddleCustomerId: customerId }, select: { id: true } }))?.id;
  }

  /** subscription.created/updated/activated/canceled/past_due/paused/resumed/trialing → Subscription row + User.plan. */
  private async applySubscription(sub: PaddleSubscription, occurredAt?: Date): Promise<boolean> {
    const priceId = sub.items?.[0]?.price?.id;
    const entry = this.prices.lookup(priceId);
    if (!priceId || entry?.kind !== "subscription") return false;
    const userId = await this.userIdFor(sub.customer_id, sub.custom_data);
    if (!userId) return false;
    const interval: BillingInterval = entry.interval;
    const ends = sub.current_billing_period?.ends_at ?? sub.scheduled_change?.effective_at ?? sub.canceled_at ?? null;
    const snap: SubscriptionSnapshot = {
      userId,
      providerSubscriptionId: sub.id,
      providerPriceId: priceId,
      plan: entry.plan,
      interval,
      status: sub.status,
      currentPeriodEnd: ends ? new Date(ends) : new Date(),
      cancelAtPeriodEnd: sub.scheduled_change?.action === "cancel",
      occurredAt,
    };
    await applySnapshot(snap);
    return true;
  }

  /** transaction.completed for a pack or pass price → grant it once. Subscription payments are handled by subscription.* events. */
  private async applyTransaction(txn: PaddleTransaction): Promise<boolean> {
    if (txn.subscription_id) return false;
    const entry = (txn.items ?? []).map((i) => this.prices.lookup(i.price?.id ?? i.price_id)).find((e) => e?.kind === "one_time");
    if (!entry || entry.kind !== "one_time") return false;
    const userId = await this.userIdFor(txn.customer_id, txn.custom_data);
    if (!userId) return false;
    await grantPurchase({ userId, provider: "paddle", providerTransactionId: txn.id, product: entry.product });
    return true;
  }
}
