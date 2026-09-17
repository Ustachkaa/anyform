import type { FastifyPluginAsync } from "fastify";
import { checkoutSchema, type CheckoutResponse, type PlanId } from "@anyform/shared";
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
    const url = await billing.createCheckout(user, body.plan as Exclude<PlanId, "free">, body.interval);
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
      const sig = request.headers["stripe-signature"];
      const raw = Buffer.isBuffer(request.body) ? request.body : Buffer.from(typeof request.body === "string" ? request.body : "");
      const result = await billing.handleWebhook(raw, Array.isArray(sig) ? sig[0] : sig);
      request.log.info({ type: result.type, handled: result.handled }, "billing webhook");
      return reply.send({ received: true, ...result });
    });
  });
};
