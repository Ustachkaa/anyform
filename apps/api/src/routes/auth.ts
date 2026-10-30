import type { FastifyPluginAsync } from "fastify";
import { forgotPasswordSchema, loginSchema, resetPasswordSchema, signupSchema, verifyEmailSchema, type AuthResponse } from "@anyform/shared";
import { Prisma } from "@prisma/client";
import { mergeGuestIntoUser, requireUser, resolveIdentity } from "../auth/identity.js";
import { clearFailures, lockedForSeconds, recordFailure } from "../auth/lockout.js";
import { hashPassword, verifyAgainstNobody, verifyPassword } from "../auth/password.js";
import { hashResetToken, sendResetLink } from "../auth/reset.js";
import { clearSession, issueSession } from "../auth/session.js";
import { consumeVerificationToken, sendVerificationLink } from "../auth/verify.js";
import { prisma } from "../db.js";
import { userToDTO } from "../dto.js";
import { ApiHttpError, errors } from "../errors.js";

const AUTH_RATE = { max: 20, timeWindow: "15 minutes" };

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/auth/signup", { config: { rateLimit: AUTH_RATE } }, async (request, reply) => {
    const body = signupSchema.parse(request.body ?? {});
    const identity = await resolveIdentity(request, reply);
    if (identity.userId) throw errors.conflict("You are already signed in.");

    const existing = await prisma.user.findUnique({ where: { email: body.email }, select: { id: true } });
    if (existing) throw errors.conflict("An account with that email already exists.", { field: "email" });

    let user;
    try {
      user = await prisma.user.create({
        data: { email: body.email, passwordHash: await hashPassword(body.password), name: body.name ?? null },
        include: { subscription: true },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw errors.conflict("An account with that email already exists.", { field: "email" });
      }
      throw err;
    }

    await mergeGuestIntoUser(identity.guestId, user.id);
    await issueSession(reply, user.id, user.sessionVersion);
    void sendVerificationLink(user.id).catch((err) => request.log.error({ err }, "verification email failed"));
    const res: AuthResponse = { user: userToDTO(user) };
    return reply.status(201).send(res);
  });

  app.post("/auth/login", { config: { rateLimit: AUTH_RATE } }, async (request, reply) => {
    const body = loginSchema.parse(request.body ?? {});
    const identity = await resolveIdentity(request, reply);

    const wait = lockedForSeconds(body.email, identity.ipHash);
    if (wait > 0) {
      throw new ApiHttpError(429, "RATE_LIMITED", `Too many wrong passwords for this account. Try again in ${Math.ceil(wait / 60)} minute${wait > 60 ? "s" : ""}, or reset your password.`, { retryAfterSeconds: wait });
    }

    const user = await prisma.user.findUnique({ where: { email: body.email }, include: { subscription: true } });
    const ok = user ? await verifyPassword(body.password, user.passwordHash) : await verifyAgainstNobody(body.password);
    if (!user || !ok) {
      recordFailure(body.email, identity.ipHash);
      throw errors.unauthorized("Wrong email or password.");
    }
    clearFailures(body.email, identity.ipHash);

    await mergeGuestIntoUser(identity.guestId, user.id);
    await issueSession(reply, user.id, user.sessionVersion);
    const res: AuthResponse = { user: userToDTO(user) };
    return res;
  });

  /**
   * Always answers 202, whether or not the email has an account, so the
   * endpoint cannot be used to discover who is registered. The email is sent
   * after the response so timing does not tell either.
   */
  app.post("/auth/forgot", { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } }, async (request, reply) => {
    const body = forgotPasswordSchema.parse(request.body ?? {});
    void sendResetLink(body.email).catch((err) => request.log.error({ err }, "password reset email failed"));
    return reply.status(202).send({ ok: true });
  });

  app.post("/auth/reset", { config: { rateLimit: AUTH_RATE } }, async (request, reply) => {
    const body = resetPasswordSchema.parse(request.body ?? {});
    const identity = await resolveIdentity(request, reply);
    const row = await prisma.passwordReset.findUnique({ where: { tokenHash: hashResetToken(body.token) } });
    if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
      throw errors.validation("This reset link has expired or was already used. Ask for a new one.", { field: "token" });
    }

    const passwordHash = await hashPassword(body.password);
    const [user] = await prisma.$transaction([
      prisma.user.update({
        where: { id: row.userId },
        // Following the emailed link proves the inbox, same as a verification link.
        data: { passwordHash, sessionVersion: { increment: 1 }, emailVerifiedAt: new Date() },
        include: { subscription: true },
      }),
      prisma.passwordReset.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
      prisma.passwordReset.deleteMany({ where: { userId: row.userId, id: { not: row.id } } }),
    ]);

    clearFailures(user.email, identity.ipHash);
    await mergeGuestIntoUser(identity.guestId, user.id);
    await issueSession(reply, user.id, user.sessionVersion);
    const res: AuthResponse = { user: userToDTO(user) };
    return res;
  });

  /** No session needed: the link may be opened on another device. */
  app.post("/auth/verify-email", { config: { rateLimit: AUTH_RATE } }, async (request) => {
    const body = verifyEmailSchema.parse(request.body ?? {});
    if (!(await consumeVerificationToken(body.token))) {
      throw errors.validation("This confirmation link has expired or was already used. Send a new one from your dashboard.", { field: "token" });
    }
    return { ok: true };
  });

  app.post("/auth/verify-email/resend", { preHandler: [requireUser], config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } }, async (request, reply) => {
    await sendVerificationLink(request.identity!.userId!);
    return reply.status(202).send({ ok: true });
  });

  app.post("/auth/logout", async (_request, reply) => {
    clearSession(reply);
    return reply.status(204).send();
  });

  app.get("/auth/me", { preHandler: [requireUser] }, async (request) => {
    const user = await prisma.user.findUnique({ where: { id: request.identity!.userId! }, include: { subscription: true } });
    if (!user) throw errors.unauthorized();
    const res: AuthResponse = { user: userToDTO(user) };
    return res;
  });
};
