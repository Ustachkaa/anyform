import { computeQuota, getPlan, monthlyPeriodStart, type UsageDTO } from "@anyform/shared";
import type { Prisma } from "@prisma/client";
import type { Identity } from "../auth/identity.js";
import { quotaConfig } from "../config.js";
import { prisma } from "../db.js";
import { errors } from "../errors.js";

/** The `where` clause that selects one identity's conversions. */
export function ownerWhere(identity: Pick<Identity, "userId" | "guestId">): Prisma.ConversionWhereInput {
  return identity.userId ? { userId: identity.userId } : { guestId: identity.guestId, userId: null };
}

/**
 * Conversions that count against the free allowance (§4 rule 3). Only ones
 * paid for by the allowance count: not those spent from pack credits or made
 * under a pass or subscription.
 */
export async function countUsed(identity: Identity, now = new Date()): Promise<number> {
  const where: Prisma.ConversionWhereInput = {
    ...ownerWhere(identity),
    status: { not: "failed" },
    chargedAs: "free",
  };
  if (quotaConfig.period === "monthly") where.createdAt = { gte: monthlyPeriodStart(now) };
  return prisma.conversion.count({ where });
}

export async function countRunning(identity: Identity): Promise<number> {
  return prisma.conversion.count({ where: { ...ownerWhere(identity), status: { in: ["queued", "processing"] } } });
}

export async function buildUsage(identity: Identity, now = new Date()): Promise<UsageDTO> {
  const plan = getPlan(identity.plan);
  const used = plan.id === "free" ? await countUsed(identity, now) : 0;
  const quota = computeQuota(plan.id, used, quotaConfig, now, { credits: identity.credits, passUntil: identity.passUntil ?? null });
  return {
    ...quota,
    maxFileBytes: plan.maxFileBytes,
    concurrentJobs: plan.concurrentJobs,
    retentionHours: plan.retentionHours,
  };
}

/**
 * Enforce size, free allowance and concurrency before accepting an upload.
 * `declaredBytes` may be unknown (multipart without Content-Length hint); the
 * streaming limit is the hard stop in that case.
 */
export async function assertCanConvert(identity: Identity, declaredBytes: number | null): Promise<UsageDTO> {
  const plan = getPlan(identity.plan);
  if (declaredBytes !== null && declaredBytes > plan.maxFileBytes) throw errors.fileTooLarge(plan.maxFileBytes);

  const usage = await buildUsage(identity);
  if (usage.exhausted) throw errors.quotaExceeded(usage);

  const running = await countRunning(identity);
  if (running >= plan.concurrentJobs) throw errors.tooManyConcurrent(plan.concurrentJobs);

  return usage;
}

export type ChargedAs = "free" | "credit" | "pass" | "plan";

/**
 * Decide what pays for a new conversion and, for a pack credit, spend it
 * atomically (never below zero, safe against concurrent uploads). Call after
 * assertCanConvert. Throws QUOTA_EXCEEDED if the last credit went elsewhere.
 */
export async function chargeConversion(identity: Identity, usage: UsageDTO): Promise<ChargedAs> {
  if (identity.planSource === "subscription") return "plan";
  if (identity.planSource === "pass") return "pass";
  if ((usage.remaining ?? 0) > 0) return "free";
  if (identity.userId && identity.credits > 0) {
    const spent = await prisma.user.updateMany({ where: { id: identity.userId, credits: { gt: 0 } }, data: { credits: { decrement: 1 } } });
    if (spent.count === 1) {
      identity.credits -= 1;
      return "credit";
    }
  }
  throw errors.quotaExceeded(usage);
}

/**
 * Give back the pack credit of a conversion that failed. Idempotent: only the
 * first call for a conversion flips chargedAs credit → credit_refunded.
 */
export async function refundCredit(conversionId: string, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const flipped = await prisma.conversion.updateMany({ where: { id: conversionId, chargedAs: "credit" }, data: { chargedAs: "credit_refunded" } });
  if (flipped.count !== 1) return false;
  await prisma.user.update({ where: { id: userId }, data: { credits: { increment: 1 } } });
  return true;
}
