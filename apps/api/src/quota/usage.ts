import { computeQuota, getPlan, monthlyPeriodStart, type UsageDTO } from "@anyform/shared";
import type { Prisma } from "@prisma/client";
import type { Identity } from "../auth/identity.js";
import { quotaConfig } from "../config.js";
import { prisma } from "../db.js";
import { errors } from "../errors.js";

type Db = Prisma.TransactionClient;

/** The `where` clause that selects one identity's conversions. */
export function ownerWhere(identity: Pick<Identity, "userId" | "guestId">): Prisma.ConversionWhereInput {
  return identity.userId ? { userId: identity.userId } : { guestId: identity.guestId, userId: null };
}

/**
 * The rows that count against an identity's free allowance. Unlike ownerWhere,
 * a guest counts every row made from this browser, including ones since
 * claimed by an account: otherwise logging out handed back 10 fresh conversions.
 */
export function quotaOwnerWhere(identity: Pick<Identity, "userId" | "guestId">): Prisma.ConversionWhereInput {
  return identity.userId ? { userId: identity.userId } : { guestId: identity.guestId };
}

/**
 * Conversions that count against the free allowance (§4 rule 3). Only ones
 * paid for by the allowance count: not those spent from pack credits or made
 * under a pass or subscription.
 */
export async function countUsed(identity: Identity, now = new Date(), db: Db = prisma): Promise<number> {
  const where: Prisma.ConversionWhereInput = {
    ...quotaOwnerWhere(identity),
    status: { not: "failed" },
    chargedAs: "free",
  };
  if (quotaConfig.period === "monthly") where.createdAt = { gte: monthlyPeriodStart(now) };
  return db.conversion.count({ where });
}

export async function countRunning(identity: Identity, db: Db = prisma): Promise<number> {
  return db.conversion.count({ where: { ...ownerWhere(identity), status: { in: ["queued", "processing"] } } });
}

export async function buildUsage(identity: Identity, now = new Date(), db: Db = prisma): Promise<UsageDTO> {
  const plan = getPlan(identity.plan);
  const used = plan.id === "free" ? await countUsed(identity, now, db) : 0;
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
export async function assertCanConvert(identity: Identity, declaredBytes: number | null, db: Db = prisma): Promise<UsageDTO> {
  const plan = getPlan(identity.plan);
  if (declaredBytes !== null && declaredBytes > plan.maxFileBytes) throw errors.fileTooLarge(plan.maxFileBytes);

  const usage = await buildUsage(identity, new Date(), db);
  if (usage.exhausted) throw errors.quotaExceeded(usage);

  const running = await countRunning(identity, db);
  if (running >= plan.concurrentJobs) throw errors.tooManyConcurrent(plan.concurrentJobs);

  return usage;
}

export type ChargedAs = "free" | "credit" | "pass" | "plan";

/**
 * Decide what pays for a new conversion and, for a pack credit, spend it
 * atomically (never below zero, safe against concurrent uploads). Call after
 * assertCanConvert. Throws QUOTA_EXCEEDED if the last credit went elsewhere.
 */
export async function chargeConversion(identity: Identity, usage: UsageDTO, db: Db = prisma): Promise<ChargedAs> {
  if (identity.planSource === "subscription") return "plan";
  if (identity.planSource === "pass") return "pass";
  if ((usage.remaining ?? 0) > 0) return "free";
  if (identity.userId && identity.credits > 0) {
    const spent = await db.user.updateMany({ where: { id: identity.userId, credits: { gt: 0 } }, data: { credits: { decrement: 1 } } });
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

/**
 * Run `fn` in a transaction holding a per-owner advisory lock. Checking the
 * allowance, charging and inserting the row must happen inside it: otherwise
 * parallel uploads all see the same "1 remaining" and all get through.
 */
export async function withOwnerLock<T>(identity: Pick<Identity, "userId" | "guestId">, fn: (tx: Db) => Promise<T>): Promise<T> {
  const key = identity.userId ? `user:${identity.userId}` : `guest:${identity.guestId}`;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
    return fn(tx);
  });
}
