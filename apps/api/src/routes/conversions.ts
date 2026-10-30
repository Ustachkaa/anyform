import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import type { MultipartFile } from "@fastify/multipart";
import { Prisma, type Conversion } from "@prisma/client";
import {
  canConvert,
  createConversionFieldsSchema,
  extOf,
  formatOfFilename,
  getFormat,
  getPlan,
  replaceExt,
  safeFilename,
  type CreateConversionResponse,
  type FormatDef,
} from "@anyform/shared";
import { requireUser, withIdentity, type Identity } from "../auth/identity.js";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { conversionToDTO } from "../dto.js";
import { ApiHttpError, errors } from "../errors.js";
import { contentDisposition } from "../http.js";
import { enqueueConvert } from "../queue.js";
import { assertCanConvert, buildUsage, chargeConversion, ownerWhere, refundCredit, withOwnerLock } from "../quota/usage.js";
import { buildKey, getStorage } from "../storage/index.js";

const uploadTmpDir =
  config.STORAGE_DRIVER === "local" ? path.join(path.resolve(config.STORAGE_LOCAL_DIR), "tmp") : path.join(os.tmpdir(), "anyform-uploads");

function fieldValue(part: MultipartFile, name: string): string | undefined {
  const raw = part.fields[name];
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v && v.type === "field" && v.value !== undefined && v.value !== null) return String(v.value);
  return undefined;
}

function parseOptions(raw: string | undefined): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    throw errors.validation("`options` must be a JSON object.");
  }
}

function requireTarget(source: FormatDef, targetRaw: string | undefined, optionsRaw: string | undefined) {
  if (!targetRaw) throw errors.validation("Provide the target format in the `target` field (before the file) or as ?target=.");
  const fields = createConversionFieldsSchema.parse({ target: targetRaw, options: parseOptions(optionsRaw) });
  const target = getFormat(fields.target);
  if (!target || !target.output) throw errors.unsupportedFormat(fields.target);
  if (!canConvert(source, target)) throw errors.unsupportedConversion(source.ext, target.ext);
  return { target, options: fields.options };
}

async function assertGuestIpAllowance(identity: Identity): Promise<void> {
  if (identity.userId) return;
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const n = await prisma.conversion.count({ where: { ipHash: identity.ipHash, userId: null, createdAt: { gte: since } } });
  if (n >= config.GUEST_UPLOADS_PER_HOUR) throw errors.rateLimited();
}

async function loadOwned(request: FastifyRequest, id: string): Promise<Conversion> {
  const identity = request.identity!;
  const row = await prisma.conversion.findFirst({ where: { id, ...ownerWhere(identity) } });
  if (!row) throw errors.notFound("No such conversion.");
  return row;
}

export const conversionRoutes: FastifyPluginAsync = async (app) => {
  await mkdir(uploadTmpDir, { recursive: true });

  // ── create ─────────────────────────────────────────────────────────────
  app.post<{ Querystring: { target?: string } }>(
    "/conversions",
    { preHandler: [withIdentity], config: { rateLimit: { max: 120, timeWindow: "1 hour" } } },
    async (request, reply) => {
      const identity = request.identity!;
      const plan = getPlan(identity.plan);

      if (!request.isMultipart()) throw errors.validation("Send the file as multipart/form-data in a `file` field.");

      // Fast fail on an obviously oversized body (Content-Length includes multipart framing; allow 1 MB slack).
      const declared = Number(request.headers["content-length"]);
      if (Number.isFinite(declared) && declared > plan.maxFileBytes + 1024 * 1024) throw errors.fileTooLarge(plan.maxFileBytes);

      // Fast fail before reading the body; the authoritative check runs under a lock below.
      await assertCanConvert(identity, null);
      await assertGuestIpAllowance(identity);

      const part = await request.file({ limits: { fileSize: plan.maxFileBytes } });
      if (!part) throw errors.validation("Attach the file to convert in the `file` field.");

      const drain = () => {
        part.file.resume();
      };

      const source = formatOfFilename(part.filename);
      if (!source || !source.input) {
        drain();
        throw errors.unsupportedFormat(extOf(part.filename) || "unknown");
      }

      // Target must arrive as a query param or as a field *before* the file:
      // fields after the file part are never parsed, so fail before streaming it.
      let resolved: ReturnType<typeof requireTarget>;
      try {
        resolved = requireTarget(source, request.query.target ?? fieldValue(part, "target"), fieldValue(part, "options"));
      } catch (err) {
        drain();
        throw err;
      }

      const id = randomUUID();
      const tmpPath = path.join(uploadTmpDir, `${id}.upload`);
      try {
        await pipeline(part.file, createWriteStream(tmpPath));
        if (part.file.truncated) throw errors.fileTooLarge(plan.maxFileBytes);

        const bytes = (await stat(tmpPath)).size;
        if (bytes === 0) throw errors.validation("That file is empty.");
        if (bytes > plan.maxFileBytes) throw errors.fileTooLarge(plan.maxFileBytes);

        // The check above ran before the upload, so parallel uploads all passed it.
        // Re-check, charge and insert the row under a per-owner lock: the row is
        // what the next waiter counts, so only as many get through as are allowed.
        const createdAt = new Date();
        const sourceKey = buildKey("src", id, source.ext, createdAt);
        const sourceName = safeFilename(part.filename);
        const row = await withOwnerLock(identity, async (tx) => {
          const usage = await assertCanConvert(identity, null, tx);
          const chargedAs = await chargeConversion(identity, usage, tx);
          return tx.conversion.create({
            data: {
              id,
              userId: identity.userId ?? null,
              guestId: identity.userId ? null : identity.guestId,
              status: "queued",
              chargedAs,
              sourceName,
              sourceExt: source.ext,
              targetExt: resolved.target.ext,
              sourceBytes: BigInt(bytes),
              sourceKey,
              outputName: replaceExt(sourceName, resolved.target.ext),
              options: resolved.options ? (resolved.options as Prisma.InputJsonValue) : undefined,
              ipHash: identity.ipHash,
              createdAt,
              expiresAt: new Date(createdAt.getTime() + plan.retentionHours * 3600 * 1000),
            },
          });
        });

        try {
          await getStorage().putFile(sourceKey, tmpPath, source.mime);
        } catch (err) {
          await prisma.conversion.update({ where: { id }, data: { status: "failed", error: "Could not store the upload. Please try again." } });
          await refundCredit(id, row.userId);
          throw err;
        }

        try {
          await enqueueConvert({ conversionId: id }, { priority: plan.priority });
        } catch (err) {
          request.log.error({ err }, "could not enqueue conversion");
          await prisma.conversion.update({ where: { id }, data: { status: "failed", error: "Could not queue the conversion. Please try again." } });
          await refundCredit(id, row.userId);
          throw errors.internal("Could not queue the conversion. Please try again.");
        }

        const res: CreateConversionResponse = { conversion: conversionToDTO(row), usage: await buildUsage(identity) };
        return reply.status(201).send(res);
      } catch (err) {
        await rm(tmpPath, { force: true }).catch(() => undefined);
        const code = (err as { code?: string }).code;
        if (code === "FST_REQ_FILE_TOO_LARGE" || part.file.truncated) throw errors.fileTooLarge(plan.maxFileBytes);
        throw err;
      }
    },
  );

  // ── list (account history) ─────────────────────────────────────────────
  app.get("/conversions", { preHandler: [requireUser] }, async (request) => {
    const rows = await prisma.conversion.findMany({
      where: { userId: request.identity!.userId! },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const now = new Date();
    return { conversions: rows.map((r) => conversionToDTO(r, now)) };
  });

  // ── status ─────────────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>("/conversions/:id", { preHandler: [withIdentity], config: { rateLimit: false } }, async (request) => {
    const row = await loadOwned(request, request.params.id);
    return conversionToDTO(row);
  });

  // ── download ───────────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>("/conversions/:id/download", { preHandler: [withIdentity], config: { rateLimit: false } }, async (request, reply) => {
    const row = await loadOwned(request, request.params.id);
    if (row.status === "failed") throw new ApiHttpError(409, "CONVERSION_FAILED", row.error ?? "This conversion failed.");
    if (row.status !== "done") throw errors.notReady();
    if (!row.outputKey || row.expiresAt.getTime() <= Date.now()) throw errors.expired();

    const storage = getStorage();
    const filename = row.outputName ?? replaceExt(row.sourceName, row.targetExt);
    const mime = getFormat(row.targetExt)?.mime ?? "application/octet-stream";

    if (storage.getSignedUrl) {
      const url = await storage.getSignedUrl(row.outputKey, filename, mime, 300);
      return reply.redirect(url, 302);
    }

    const info = await storage.stat(row.outputKey);
    if (!info) throw errors.expired();
    const stream = await storage.getStream(row.outputKey);
    reply
      .header("Content-Type", mime)
      .header("Content-Length", String(info.size))
      .header("Content-Disposition", contentDisposition(filename))
      .header("Cache-Control", "private, no-store")
      .header("X-Content-Type-Options", "nosniff")
      // Outputs are user-controlled content (html, svg-bearing pdf, ...): even if a
      // browser rendered one instead of downloading it, it gets no scripts and no origin.
      .header("Content-Security-Policy", "default-src 'none'; sandbox")
      .header("Cross-Origin-Resource-Policy", "same-origin");
    return reply.send(stream);
  });

  // ── delete now ─────────────────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>("/conversions/:id", { preHandler: [withIdentity] }, async (request, reply) => {
    const row = await loadOwned(request, request.params.id);
    const storage = getStorage();
    for (const key of [row.sourceKey, row.outputKey]) {
      if (!key) continue;
      await storage.delete(key).catch((err) => request.log.warn({ err, key }, "delete: could not remove object"));
    }
    await prisma.conversion.update({ where: { id: row.id }, data: { sourceKey: "", outputKey: null } });
    return reply.status(204).send();
  });
};
