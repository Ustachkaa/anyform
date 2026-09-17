import { createHash } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { getPlan, type PlanId } from "@anyform/shared";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { errors } from "../errors.js";
import { resolveGuestId } from "./guest.js";
import { readSession } from "./session.js";

export interface Identity {
  userId?: string;
  guestId: string;
  plan: PlanId;
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
  let identity: Identity = { guestId, plan: "free", ipHash };

  const userId = await readSession(request);
  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, plan: true } });
    if (user) identity = { ...identity, userId: user.id, plan: getPlan(user.plan).id };
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
 * person into their account. Idempotent.
 */
export async function mergeGuestIntoUser(guestId: string, userId: string): Promise<number> {
  const res = await prisma.conversion.updateMany({
    where: { guestId, userId: null },
    data: { userId, guestId: null },
  });
  return res.count;
}
