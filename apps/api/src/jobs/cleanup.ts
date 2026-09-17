import type { Logger } from "pino";
import { prisma } from "../db.js";
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
  return { scanned: rows.length, deleted };
}
