import PgBoss from "pg-boss";
import { config } from "./config.js";

/**
 * pg-boss lives inside Postgres, so the API and worker share the database
 * connection string and nothing else. Queues are created idempotently on
 * start by whichever process comes up first.
 */

export const QUEUE_CONVERT = "convert";
export const QUEUE_CLEANUP = "cleanup";

export interface ConvertJobData {
  conversionId: string;
}

export interface CleanupJobData {
  /** Present so the payload is never an empty object (pg-boss singleton keys). */
  reason: "schedule" | "manual";
}

let boss: PgBoss | undefined;
let starting: Promise<PgBoss> | undefined;

type QueueOptions = Omit<NonNullable<Parameters<PgBoss["createQueue"]>[1]>, "name">;

async function ensureQueue(b: PgBoss, name: string, options: QueueOptions): Promise<void> {
  const existing = await b.getQueue(name);
  if (!existing) await b.createQueue(name, { name, ...options });
}

/** Start (once) and return the shared pg-boss instance. Safe to call repeatedly. */
export function startBoss(): Promise<PgBoss> {
  if (boss) return Promise.resolve(boss);
  if (starting) return starting;
  starting = (async () => {
    const b = new PgBoss({
      connectionString: config.DATABASE_URL,
      schema: "pgboss",
      max: 5,
      // Keep completed/failed job rows for a day for debugging; the Conversion row is the source of truth.
      deleteAfterDays: 1,
      archiveCompletedAfterSeconds: 60 * 60,
    });
    b.on("error", (err) => {
      // eslint-disable-next-line no-console
      console.error("[pg-boss]", err);
    });
    await b.start();
    await ensureQueue(b, QUEUE_CONVERT, {
      retryLimit: 1,
      retryDelay: 15,
      expireInSeconds: Math.ceil(config.JOB_TIMEOUT_MS / 1000) + 60,
    });
    await ensureQueue(b, QUEUE_CLEANUP, { retryLimit: 0, expireInSeconds: 600 });
    boss = b;
    return b;
  })();
  starting.catch(() => {
    starting = undefined;
  });
  return starting;
}

export async function stopBoss(): Promise<void> {
  if (!boss) return;
  const b = boss;
  boss = undefined;
  starting = undefined;
  await b.stop({ graceful: true, timeout: 30_000 });
}

export interface EnqueueConvertOptions {
  priority: number;
}

export async function enqueueConvert(data: ConvertJobData, opts: EnqueueConvertOptions): Promise<string | null> {
  const b = await startBoss();
  return b.send(QUEUE_CONVERT, data, {
    priority: opts.priority,
    retryLimit: 1,
    retryDelay: 15,
    expireInSeconds: Math.ceil(config.JOB_TIMEOUT_MS / 1000) + 60,
    singletonKey: data.conversionId,
  });
}
