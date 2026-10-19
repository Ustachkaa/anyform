import { ONE_TIME_PRODUCTS, type OneTimeProductId } from "@anyform/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { effectivePlan, type SubscriptionSnapshot } from "./provider.js";

/**
 * Provider-neutral effects of billing events. Providers translate their
 * webhooks into these calls; nothing here knows about Stripe or Paddle.
 */

/** Upsert the Subscription row and denormalise User.plan (ARCHITECTURE §10). */
export async function applySnapshot(snap: SubscriptionSnapshot): Promise<void> {
  const plan = effectivePlan(snap);
  const fields = {
    providerSubscriptionId: snap.providerSubscriptionId,
    providerPriceId: snap.providerPriceId,
    plan: snap.plan,
    interval: snap.interval,
    status: snap.status,
    currentPeriodEnd: snap.currentPeriodEnd,
    cancelAtPeriodEnd: snap.cancelAtPeriodEnd,
  };
  await prisma.$transaction([
    prisma.subscription.upsert({ where: { userId: snap.userId }, create: { userId: snap.userId, ...fields }, update: fields }),
    prisma.user.update({ where: { id: snap.userId }, data: { plan } }),
  ]);
}

export interface PurchaseGrant {
  userId: string;
  provider: "paddle" | "stripe";
  /** The provider's id for the paid transaction; a repeat is ignored. */
  providerTransactionId: string;
  product: OneTimeProductId;
  now?: Date;
}

/**
 * Grant a one-time purchase exactly once. A pack adds credits; a pass sets
 * `passUntil` to 24 h from now, or 24 h past an unexpired pass. Returns false
 * when this transaction was already granted (webhooks are re-delivered).
 */
export async function grantPurchase(g: PurchaseGrant): Promise<boolean> {
  const product = ONE_TIME_PRODUCTS[g.product];
  const now = g.now ?? new Date();
  // Re-deliveries are normal: answer them without provoking (and logging) a unique-key error.
  if (await prisma.purchase.findUnique({ where: { providerTransactionId: g.providerTransactionId }, select: { id: true } })) return false;
  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: g.userId }, select: { passUntil: true } });
      const credits = product.credits ?? 0;
      let passUntil: Date | null = null;
      if (product.hours) {
        const from = user.passUntil && user.passUntil > now ? user.passUntil : now;
        passUntil = new Date(from.getTime() + product.hours * 3600_000);
      }
      await tx.purchase.create({
        data: { userId: g.userId, provider: g.provider, providerTransactionId: g.providerTransactionId, product: g.product, credits, passUntil },
      });
      await tx.user.update({
        where: { id: g.userId },
        data: { ...(credits ? { credits: { increment: credits } } : {}), ...(passUntil ? { passUntil } : {}) },
      });
    });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return false;
    throw err;
  }
}
