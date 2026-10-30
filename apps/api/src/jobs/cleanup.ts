import type { Logger } from "pino";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { refundCredit } from "../quota/usage.js";
import { getStorage } from "../storage/index.js";

/**
 * Delete stored files for conversions past `expiresAt` and blank their keys.
 * Rows are kept so history and usage counts survive. Runs every 10 minutes.
 */
export async function runCleanup(log: Logger, batch = 200): Promise<{ scanned: number; deleted: number }> {
  const storage = getStorage();
  const now = new Date();
  const rows = await prisma.conversion.findMany({
    where: {
      expiresAt: { lt: now },
      OR: [{ outputKey: { not: null } }, { sourceKey: { not: "" } }],
    },
    select: { id: true, sourceKey: true, outputKey: true },
    take: batch,
    orderBy: { expiresAt: "asc" },
  });

  let deleted = 0;
  for (const row of rows) {
    for (const key of [row.sourceKey, row.outputKey]) {
      if (!key) continue;
      try {
        await storage.delete(key);
        deleted++;
      } catch (err) {
        log.warn({ err, key }, "cleanup: could not delete object");
      }
    }
    await prisma.conversion.update({ where: { id: row.id }, data: { sourceKey: "", outputKey: null } });
  }
  if (rows.length) log.info({ scanned: rows.length, deleted }, "cleanup run");
  await failStuckConversions(log, now);
  return { scanned: rows.length, deleted };
}

/** A queued row this old was never picked up (lost enqueue, crashed upload). */
const QUEUED_GIVE_UP_MS = 6 * 3600_000;

/**
 * Rows left in "processing" by a crashed worker, or "queued" by a lost job,
 * would count against the user's quota and concurrency limit forever (a free
 * user could never convert again). Fail them and give back any pack credit.
 */
export async function failStuckConversions(log: Logger, now = new Date()): Promise<number> {
  const stuck = await prisma.conversion.findMany({
    where: {
      OR: [
        // Past the whole job's budget plus the queue's expiry margin and a retry.
        { status: "processing", startedAt: { lt: new Date(now.getTime() - 2 * config.JOB_TIMEOUT_MS - 15 * 60_000) } },
        { status: "queued", createdAt: { lt: new Date(now.getTime() - QUEUED_GIVE_UP_MS) } },
      ],
    },
    select: { id: true, userId: true, status: true },
    take: 200,
  });
  let failed = 0;
  for (const row of stuck) {
    // Conditional on the status we saw, so a worker that finishes meanwhile wins.
    const flipped = await prisma.conversion.updateMany({
      where: { id: row.id, status: row.status },
      data: { status: "failed", error: "The conversion stalled. Please try again.", finishedAt: now },
    });
    if (flipped.count !== 1) continue;
    failed++;
    await refundCredit(row.id, row.userId).catch((err) => log.error({ err, conversionId: row.id }, "could not refund credit"));
  }
  if (failed) log.warn({ failed }, "cleanup: failed stuck conversions");
  return failed;
}
