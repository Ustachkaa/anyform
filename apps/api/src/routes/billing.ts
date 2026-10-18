import type { FastifyPluginAsync } from "fastify";
import { checkoutSchema, type CheckoutResponse, type PlanId } from "@anyform/shared";
import type { CheckoutItem } from "../billing/provider.js";
import { requireUser } from "../auth/identity.js";
import { getBilling, requireBilling } from "../billing/index.js";
import { prisma } from "../db.js";
import { errors } from "../errors.js";

export const billingRoutes: FastifyPluginAsync = async (app) => {
  app.post("/billing/checkout", { preHandler: [requireUser], config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request) => {
    const billing = requireBilling();
    const body = checkoutSchema.parse(request.body ?? {});
    const user = await prisma.user.findUnique({ where: { id: request.identity!.userId! } });
    if (!user) throw errors.unauthorized();
    const item: CheckoutItem =
      "product" in body
        ? { kind: "one_time", product: body.product }
        : { kind: "subscription", plan: body.plan as Exclude<PlanId, "free">, interval: body.interval };
    const url = await billing.createCheckout(user, item);
    const res: CheckoutResponse = { url };
    return res;
  });

  app.post("/billing/portal", { preHandler: [requireUser], config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request) => {
    const billing = requireBilling();
    const user = await prisma.user.findUnique({ where: { id: request.identity!.userId! } });
    if (!user) throw errors.unauthorized();
    const res: CheckoutResponse = { url: await billing.createPortal(user) };
    return res;
  });

  // Webhook needs the raw body for signature verification, so it lives in an
  // encapsulated context with its own JSON parser.
  await app.register(async (child) => {
    child.removeContentTypeParser("application/json");
    child.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => done(null, body));
    child.post("/billing/webhook", { config: { rateLimit: false } }, async (request, reply) => {
      const billing = getBilling();
      if (!billing) throw errors.billingUnavailable();
      const header = (name: string) => {
        const v = request.headers[name];
        return Array.isArray(v) ? v[0] : v;
      };
      const raw = Buffer.isBuffer(request.body) ? request.body : Buffer.from(typeof request.body === "string" ? request.body : "");
      const result = await billing.handleWebhook(raw, { "stripe-signature": header("stripe-signature"), "paddle-signature": header("paddle-signature") });
      request.log.info({ type: result.type, handled: result.handled }, "billing webhook");
      return reply.send({ received: true, ...result });
    });
  });
};
