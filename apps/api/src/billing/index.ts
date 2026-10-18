import { config } from "../config.js";
import { errors } from "../errors.js";
import { PaddleBilling } from "./paddle.js";
import type { BillingProvider } from "./provider.js";
import { StripeBilling } from "./stripe.js";

export type { BillingProvider } from "./provider.js";

let provider: BillingProvider | null | undefined;

/**
 * The configured provider, or null when billing is not set up (routes answer 503).
 * BILLING_PROVIDER picks one explicitly; otherwise Paddle wins if its key is set.
 */
export function getBilling(): BillingProvider | null {
  if (provider !== undefined) return provider;
  const choice = config.BILLING_PROVIDER ?? (config.PADDLE_API_KEY ? "paddle" : config.STRIPE_SECRET_KEY ? "stripe" : undefined);
  if (choice === "paddle" && config.PADDLE_API_KEY) provider = new PaddleBilling(config.PADDLE_API_KEY, config.PADDLE_WEBHOOK_SECRET);
  else if (choice === "stripe" && config.STRIPE_SECRET_KEY) provider = new StripeBilling(config.STRIPE_SECRET_KEY, config.STRIPE_WEBHOOK_SECRET);
  else provider = null;
  return provider;
}

export function requireBilling(): BillingProvider {
  const p = getBilling();
  if (!p) throw errors.billingUnavailable();
  return p;
}

/** Test hook. */
export function setBilling(p: BillingProvider | null | undefined): void {
  provider = p;
}
