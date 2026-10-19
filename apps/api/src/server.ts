import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { PLANS } from "@anyform/shared";
import { SESSION_COOKIE } from "./auth/session.js";
import { config, isProd, isTest } from "./config.js";
import { errors, registerErrorHandler } from "./errors.js";
import { startBoss, stopBoss } from "./queue.js";
import { v1Routes } from "./routes/index.js";

export interface BuildAppOptions {
  logger?: FastifyServerOptions["logger"];
}

function defaultLogger(): FastifyServerOptions["logger"] {
  if (isTest) return false;
  if (isProd) return { level: "info" };
  return {
    level: "debug",
    transport: { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" } },
  };
}

/** Build the Fastify app without touching the database or queue (so tests can `inject`). */
export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger ?? defaultLogger(),
    trustProxy: config.TRUST_PROXY.split(",").map((p) => p.trim()).filter(Boolean),
    bodyLimit: 1024 * 1024,
  });

  registerErrorHandler(app);

  await app.register(cors, {
    origin: [config.WEB_ORIGIN],
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  });
  await app.register(cookie, { secret: config.COOKIE_SECRET });
  await app.register(jwt, {
    secret: config.JWT_SECRET,
    cookie: { cookieName: SESSION_COOKIE, signed: false },
  });
  await app.register(rateLimit, {
    global: true,
    max: config.GLOBAL_RATE_LIMIT_PER_MINUTE,
    timeWindow: "1 minute",
    errorResponseBuilder: () => ({ statusCode: 429, ...errors.rateLimited().toBody() }),
  });
  await app.register(multipart, {
    limits: {
      files: 1,
      fields: 20,
      fieldSize: 64 * 1024,
      fileSize: PLANS.business.maxFileBytes,
    },
  });

  // CSRF defence in depth (session cookies are already SameSite=Lax): a browser
  // always sends Origin on cross-site POST/PATCH/DELETE, so refuse state changes
  // whose Origin isn't ours. Requests without Origin (server-to-server, curl) and
  // provider webhooks (signed) pass.
  const allowedOrigins = new Set([new URL(config.WEB_ORIGIN).origin, new URL(config.API_PUBLIC_URL).origin]);
  app.addHook("onRequest", async (request) => {
    if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") return;
    if (request.url.startsWith("/v1/billing/webhook")) return;
    const origin = request.headers.origin;
    if (origin && !allowedOrigins.has(origin)) throw errors.forbidden("Cross-site request refused.");
  });

  app.addHook("onSend", async (_request, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
  });

  await app.register(v1Routes, { prefix: "/v1" });
  return app;
}

async function main(): Promise<void> {
  const app = await buildApp();
  try {
    await startBoss();
    app.log.info("job queue ready");
  } catch (err) {
    app.log.error({ err }, "could not start the job queue (is DATABASE_URL reachable?)");
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    await app.close().catch(() => undefined);
    await stopBoss().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  await app.listen({ port: config.API_PORT, host: config.API_HOST });
  app.log.info(`Anyform API listening on ${config.API_PUBLIC_URL} (storage: ${config.STORAGE_DRIVER}, free quota: ${config.FREE_CONVERSIONS}/${config.FREE_QUOTA_PERIOD})`);
}

const isEntrypoint = process.argv[1] ? /server\.(ts|js)$/.test(process.argv[1]) : false;
if (isEntrypoint) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}
