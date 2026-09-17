import pino from "pino";
import { config, isProd } from "./config.js";
import { probeEngines } from "./engines/registry.js";
import { runCleanup } from "./jobs/cleanup.js";
import { runConversion } from "./jobs/convert.js";
import { QUEUE_CLEANUP, QUEUE_CONVERT, startBoss, stopBoss, type CleanupJobData, type ConvertJobData } from "./queue.js";

/**
 * Worker entrypoint: N independent pollers on the convert queue (pg-boss v10
 * has no team size, so concurrency = number of `work()` registrations) plus
 * one poller for the scheduled cleanup.
 */

const log = pino(
  isProd
    ? { level: "info" }
    : { level: "debug", transport: { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" } } },
).child({ svc: "worker" });

async function main(): Promise<void> {
  const engines = await probeEngines();
  log.info(
    { engines: Object.fromEntries(engines.map((e) => [e.name, e.available ? (e.version ?? "ok") : "missing"])) },
    "engine availability",
  );

  const boss = await startBoss();

  for (let i = 0; i < config.WORKER_CONCURRENCY; i++) {
    await boss.work<ConvertJobData>(QUEUE_CONVERT, { batchSize: 1, pollingIntervalSeconds: 1 }, async (jobs) => {
      for (const job of jobs) {
        log.debug({ jobId: job.id, conversionId: job.data.conversionId }, "job start");
        await runConversion(job.data.conversionId, log);
      }
    });
  }

  await boss.work<CleanupJobData>(QUEUE_CLEANUP, { batchSize: 1, pollingIntervalSeconds: 30 }, async () => {
    await runCleanup(log);
  });
  await boss.schedule(QUEUE_CLEANUP, config.CLEANUP_CRON, { reason: "schedule" }, { tz: "UTC" });

  log.info({ concurrency: config.WORKER_CONCURRENCY, cleanup: config.CLEANUP_CRON }, "worker ready");

  const shutdown = async (signal: string) => {
    log.info({ signal }, "worker shutting down (waiting for running jobs)");
    await stopBoss().catch((err) => log.error({ err }, "error stopping pg-boss"));
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  log.fatal({ err }, "worker failed to start");
  process.exit(1);
});
