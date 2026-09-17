import { config } from "../config.js";
import { errors } from "../errors.js";
import type { BillingProvider } from "./provider.js";
import { StripeBilling } from "./stripe.js";

export type { BillingProvider } from "./provider.js";

let provider: BillingProvider | null | undefined;

/** The configured provider, or null when billing is not set up (routes answer 503). */
export function getBilling(): BillingProvider | null {
  if (provider !== undefined) return provider;
  provider = config.STRIPE_SECRET_KEY ? new StripeBilling(config.STRIPE_SECRET_KEY, config.STRIPE_WEBHOOK_SECRET) : null;
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
