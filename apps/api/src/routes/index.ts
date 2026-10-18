import type { FastifyPluginAsync } from "fastify";
import { accountRoutes } from "./account.js";
import { authRoutes } from "./auth.js";
import { billingRoutes } from "./billing.js";
import { conversionRoutes } from "./conversions.js";
import { formatsRoutes } from "./formats.js";
import { healthRoutes } from "./health.js";
import { usageRoutes } from "./usage.js";

/** Everything under /v1. */
export const v1Routes: FastifyPluginAsync = async (app) => {
  await app.register(healthRoutes);
  await app.register(formatsRoutes);
  await app.register(authRoutes);
  await app.register(accountRoutes);
  await app.register(usageRoutes);
  await app.register(conversionRoutes);
  await app.register(billingRoutes);
};
