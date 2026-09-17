import { randomUUID } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { cookieBaseOptions } from "./session.js";

export const GUEST_COOKIE = "af_guest";
const GUEST_TTL_SECONDS = 365 * 24 * 60 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Read the signed guest cookie, or mint a new one. The guest id is what the
 * free-conversion count hangs off for anonymous visitors.
 */
export function resolveGuestId(request: FastifyRequest, reply: FastifyReply): string {
  const rawCookie = request.cookies[GUEST_COOKIE];
  if (rawCookie) {
    const unsigned = request.unsignCookie(rawCookie);
    if (unsigned.valid && unsigned.value && UUID.test(unsigned.value)) {
      if (unsigned.renew) setGuestCookie(reply, unsigned.value);
      return unsigned.value;
    }
  }
  const id = randomUUID();
  setGuestCookie(reply, id);
  return id;
}

export function setGuestCookie(reply: FastifyReply, id: string): void {
  reply.setCookie(GUEST_COOKIE, id, { ...cookieBaseOptions, signed: true, maxAge: GUEST_TTL_SECONDS });
}
