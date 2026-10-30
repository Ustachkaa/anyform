import { createHash } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { getPlan, ONE_TIME_PRODUCTS, type PlanId } from "@anyform/shared";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { errors } from "../errors.js";
import { resolveGuestId } from "./guest.js";
import { readSession } from "./session.js";

export interface Identity {
  userId?: string;
  guestId: string;
  /** Effective plan: the subscription's, or "starter" while a 24-hour pass is active. */
  plan: PlanId;
  /** Why `plan` applies: no payment, a subscription, or a 24-hour pass. */
  planSource: "free" | "subscription" | "pass";
  /** Conversion-pack credits left (signed-in users only). */
  credits: number;
  /** End of an active 24-hour pass. */
  passUntil?: Date;
  /** Salted SHA-256 of the client IP, for abuse throttling only. */
  ipHash: string;
}

declare module "fastify" {
  interface FastifyRequest {
    identity?: Identity;
  }
}

export function hashIp(ip: string): string {
  return createHash("sha256").update(`${config.COOKIE_SECRET}:${ip}`).digest("hex").slice(0, 32);
}

/**
 * Resolve who is making the request. Always yields a guest id (minting one if
 * needed) and, when a valid session cookie is present, the user id and plan.
 * Cached on the request.
 */
export async function resolveIdentity(request: FastifyRequest, reply: FastifyReply): Promise<Identity> {
  if (request.identity) return request.identity;
  const guestId = resolveGuestId(request, reply);
  const ipHash = hashIp(request.ip);
  let identity: Identity = { guestId, plan: "free", planSource: "free", credits: 0, ipHash };

  const session = await readSession(request);
  if (session) {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, plan: true, sessionVersion: true, credits: true, passUntil: true },
    });
    // A password change/reset bumps sessionVersion, so sessions issued before it stop working.
    if (user && user.sessionVersion === session.sessionVersion) {
      const subscribed = getPlan(user.plan).id;
      const pass = user.passUntil && user.passUntil.getTime() > Date.now() ? user.passUntil : undefined;
      identity = {
        ...identity,
        userId: user.id,
        credits: user.credits,
        passUntil: pass,
        ...(subscribed !== "free"
          ? { plan: subscribed, planSource: "subscription" as const }
          : pass
            ? { plan: ONE_TIME_PRODUCTS.pass.grantsPlan ?? "starter", planSource: "pass" as const }
            : {}),
      };
    }
  }
  request.identity = identity;
  return identity;
}

/** preHandler: attach identity (guest or user). */
export async function withIdentity(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await resolveIdentity(request, reply);
}

/** preHandler: require a logged-in user. */
export async function requireUser(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const id = await resolveIdentity(request, reply);
  if (!id.userId) throw errors.unauthorized();
}

export function currentUserId(request: FastifyRequest): string {
  const id = request.identity?.userId;
  if (!id) throw errors.unauthorized();
  return id;
}

/**
 * Re-attribute a guest's conversions to a user so the free count follows the
 * person into their account. Idempotent. guestId stays on the rows so the
 * browser's guest allowance still counts them after logout (§3).
 */
export async function mergeGuestIntoUser(guestId: string, userId: string): Promise<number> {
  const res = await prisma.conversion.updateMany({
    where: { guestId, userId: null },
    data: { userId },
  });
  return res.count;
}
