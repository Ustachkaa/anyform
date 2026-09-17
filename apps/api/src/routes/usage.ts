import type { FastifyPluginAsync } from "fastify";
import { withIdentity } from "../auth/identity.js";
import { buildUsage } from "../quota/usage.js";

export const usageRoutes: FastifyPluginAsync = async (app) => {
  app.get("/usage", { preHandler: [withIdentity] }, async (request) => buildUsage(request.identity!));
};
