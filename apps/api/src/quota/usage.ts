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

/** Conversions that count against the free allowance (§4 rule 3). */
export async function countUsed(identity: Identity, now = new Date()): Promise<number> {
  const where: Prisma.ConversionWhereInput = {
    ...ownerWhere(identity),
    status: { not: "failed" },
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
  const quota = computeQuota(plan.id, used, quotaConfig, now);
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
