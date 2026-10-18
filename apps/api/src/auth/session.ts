import type { FastifyReply, FastifyRequest } from "fastify";
import { config, isProd } from "../config.js";

export const SESSION_COOKIE = "af_session";
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface SessionPayload {
  /** User id. */
  sub: string;
  /** User.sessionVersion at sign-in; a password change/reset bumps it and retires older sessions. Absent on pre-versioning cookies (= 0). */
  sv?: number;
}

export interface SessionInfo {
  userId: string;
  sessionVersion: number;
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

export async function issueSession(reply: FastifyReply, userId: string, sessionVersion: number): Promise<void> {
  const token = await reply.jwtSign({ sub: userId, sv: sessionVersion }, { expiresIn: SESSION_TTL_SECONDS });
  reply.setCookie(SESSION_COOKIE, token, { ...cookieBaseOptions, maxAge: SESSION_TTL_SECONDS });
}

export function clearSession(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, cookieBaseOptions);
}

/** Returns the user id and session version from a valid session cookie, or null. Never throws. */
export async function readSession(request: FastifyRequest): Promise<SessionInfo | null> {
  if (!request.cookies[SESSION_COOKIE]) return null;
  try {
    const payload = await request.jwtVerify<SessionPayload>({ onlyCookie: true });
    if (typeof payload.sub !== "string" || !payload.sub) return null;
    return { userId: payload.sub, sessionVersion: typeof payload.sv === "number" ? payload.sv : 0 };
  } catch {
    return null;
  }
}
