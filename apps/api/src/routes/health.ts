import { createRequire } from "node:module";
import type { FastifyPluginAsync } from "fastify";
import type { HealthResponse } from "@anyform/shared";
import { probeEngines } from "../engines/registry.js";

function readVersion(): string {
  try {
    const req = createRequire(import.meta.url);
    return (req("../../package.json") as { version: string }).version;
  } catch {
    return "0.0.0";
  }
}

const VERSION = readVersion();

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { engines?: string } }>("/health", { config: { rateLimit: false } }, async (request) => {
    const body: HealthResponse = { ok: true, version: VERSION, uptimeSeconds: Math.round(process.uptime()) };
    if (request.query.engines === "1" || request.query.engines === "true") body.engines = await probeEngines();
    return body;
  });
};
