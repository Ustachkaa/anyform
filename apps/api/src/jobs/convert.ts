import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Logger } from "pino";
import { getFormat, replaceExt, type ConversionOptions } from "@anyform/shared";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { CommandTimeoutError } from "../engines/exec.js";
import { EngineError, resolveEngine } from "../engines/registry.js";
import { sanitiseErrorMessage } from "../http.js";
import { refundCredit } from "../quota/usage.js";
import { buildKey, getStorage } from "../storage/index.js";
import { locateOutput, noOutputMessage } from "./output.js";

/**
 * The convert job (ARCHITECTURE §5). Deterministic failures (bad file,
 * unsupported by the installed engines) mark the row failed and return;
 * infrastructure failures (storage, database) also mark the row failed but
 * rethrow so pg-boss retries once.
 */

export interface ConvertResult {
  ok: boolean;
  engine?: string;
  error?: string;
}

class InfraError extends Error {}

function extractOptions(raw: unknown): ConversionOptions {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as ConversionOptions) : {};
}

export interface RunOptions {
  /** pg-boss will not retry this attempt, so an infrastructure failure is final too. */
  finalAttempt?: boolean;
}

export async function runConversion(conversionId: string, log: Logger, opts: RunOptions = {}): Promise<ConvertResult> {
  const row = await prisma.conversion.findUnique({ where: { id: conversionId } });
  if (!row) {
    log.warn({ conversionId }, "conversion row missing; dropping job");
    return { ok: false, error: "missing" };
  }
  if (row.status === "done") return { ok: true, engine: row.engine ?? undefined };
  if (!row.sourceKey) {
    await prisma.conversion.update({ where: { id: row.id }, data: { status: "failed", error: "Source file was deleted before conversion started.", finishedAt: new Date() } });
    return { ok: false, error: "source deleted" };
  }

  const storage = getStorage();
  const jobLog = log.child({ conversionId, from: row.sourceExt, to: row.targetExt });
  // Claim the row. "failed" is claimable because an infrastructure failure marks
  // it failed and rethrows for pg-boss to retry; "processing" is not, so a retry
  // fired while the first attempt is still running (pg-boss expiry) is a no-op.
  const claimed = await prisma.conversion.updateMany({
    where: { id: row.id, status: { in: ["queued", "failed"] } },
    data: { status: "processing", startedAt: new Date(), progress: 0, error: null },
  });
  if (claimed.count !== 1) {
    jobLog.warn({ status: row.status }, "conversion already claimed; skipping");
    return { ok: false, error: "already claimed" };
  }
  // One budget for the whole job: download, every engine in a chain, upload.
  const deadline = Date.now() + config.JOB_TIMEOUT_MS;

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "anyform-job-"));
  const inputPath = path.join(tmpDir, `input.${row.sourceExt}`);
  const outputPath = path.join(tmpDir, `output.${row.targetExt}`);

  // Throttled, ordered progress writes.
  let lastPct = 0;
  let lastWrite = 0;
  let pending: Promise<unknown> = Promise.resolve();
  const onProgress = (raw: number) => {
    const pct = Math.max(0, Math.min(99, Math.round(raw)));
    const now = Date.now();
    if (pct <= lastPct) return;
    if (pct - lastPct < 5 && now - lastWrite < 1000) return;
    lastPct = pct;
    lastWrite = now;
    pending = pending.then(() => prisma.conversion.update({ where: { id: row.id }, data: { progress: pct } }).catch(() => undefined));
  };

  let engineName: string | undefined;
  try {
    const engine = await resolveEngine(row.sourceExt, row.targetExt);
    if (!engine) {
      throw new EngineError("none", `No conversion engine is installed for ${row.sourceExt} → ${row.targetExt}.`);
    }
    engineName = engine.name;

    try {
      await storage.downloadToFile(row.sourceKey, inputPath);
    } catch (err) {
      throw new InfraError(`Could not read the uploaded file: ${(err as Error).message}`);
    }

    jobLog.info({ engine: engine.name }, "converting");
    await engine.convert({
      inputPath,
      outputPath,
      fromExt: row.sourceExt,
      toExt: row.targetExt,
      options: extractOptions(row.options),
      tmpDir,
      timeoutMs: Math.max(1000, deadline - Date.now()),
      onProgress,
      log: (msg) => jobLog.debug(msg),
    });

    const out = await locateOutput(outputPath);
    if (!out.ok) {
      jobLog.warn({ engine: engine.name, reason: out.reason }, "engine exited cleanly without usable output");
      throw new EngineError(engine.name, noOutputMessage(row.sourceExt, row.targetExt, out.reason));
    }

    const outputKey = buildKey("out", row.id, row.targetExt, row.createdAt);
    try {
      await storage.putFile(outputKey, outputPath, getFormat(row.targetExt)?.mime);
    } catch (err) {
      throw new InfraError(`Could not store the converted file: ${(err as Error).message}`);
    }

    await pending;
    await prisma.conversion.update({
      where: { id: row.id },
      data: {
        status: "done",
        progress: 100,
        outputKey,
        outputBytes: BigInt(out.bytes),
        outputName: row.outputName ?? replaceExt(row.sourceName, row.targetExt),
        engine: engine.name,
        finishedAt: new Date(),
        error: null,
      },
    });
    jobLog.info({ engine: engine.name, bytes: out.bytes }, "done");
    return { ok: true, engine: engine.name };
  } catch (err) {
    const message =
      err instanceof CommandTimeoutError
        ? `Conversion timed out after ${Math.round(config.JOB_TIMEOUT_MS / 60000)} minutes.`
        : sanitiseErrorMessage(err);
    await pending;
    const persistFailure = (error: string) =>
      prisma.conversion.update({
        where: { id: row.id },
        data: { status: "failed", error, engine: engineName ?? null, finishedAt: new Date() },
      });
    try {
      await persistFailure(message);
    } catch (e) {
      // A row stuck in "processing" would count against the user's quota forever,
      // so fall back to a plain-ASCII message (e.g. for databases whose encoding
      // cannot store "→") and, failing that, to a generic one.
      jobLog.warn({ err: e }, "could not persist failure message; retrying with ASCII");
      // eslint-disable-next-line no-control-regex
      const ascii = message.replace(/[^\x20-\x7e]+/g, "-").slice(0, 500);
      await persistFailure(ascii).catch(() =>
        persistFailure("Conversion failed.").catch((e2) => jobLog.error({ err: e2 }, "could not persist failure")),
      );
    }
    if (err instanceof InfraError && !opts.finalAttempt) {
      jobLog.error({ err }, "infrastructure failure; will retry");
      throw err;
    }
    // A failed conversion costs nothing: the free allowance already skips failed
    // rows, and a pack credit is given back (once).
    if (await refundCredit(row.id, row.userId).catch((e) => (jobLog.error({ err: e }, "could not refund credit"), false))) {
      jobLog.info("refunded pack credit for failed conversion");
    }
    jobLog.warn({ err: message, engine: engineName }, "conversion failed");
    return { ok: false, engine: engineName, error: message };
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
