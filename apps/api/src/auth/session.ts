import type { FastifyReply, FastifyRequest } from "fastify";
import { config, isProd } from "../config.js";

export const SESSION_COOKIE = "af_session";
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface SessionPayload {
  /** User id. */
  sub: string;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: SessionPayload;
    user: SessionPayload & { iat?: number; exp?: number };
  }
}

export const cookieBaseOptions = {
  path: "/",
  httpOnly: true,
  sameSite: "lax" as const,
  secure: isProd,
  domain: config.COOKIE_DOMAIN,
};

export async function issueSession(reply: FastifyReply, userId: string): Promise<void> {
  const token = await reply.jwtSign({ sub: userId }, { expiresIn: SESSION_TTL_SECONDS });
  reply.setCookie(SESSION_COOKIE, token, { ...cookieBaseOptions, maxAge: SESSION_TTL_SECONDS });
}

export function clearSession(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, cookieBaseOptions);
}

/** Returns the user id from a valid session cookie, or null. Never throws. */
export async function readSession(request: FastifyRequest): Promise<string | null> {
  if (!request.cookies[SESSION_COOKIE]) return null;
  try {
    const payload = await request.jwtVerify<SessionPayload>({ onlyCookie: true });
    return typeof payload.sub === "string" && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}
