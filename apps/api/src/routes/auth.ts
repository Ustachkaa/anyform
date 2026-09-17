import type { FastifyPluginAsync } from "fastify";
import { loginSchema, signupSchema, type AuthResponse } from "@anyform/shared";
import { Prisma } from "@prisma/client";
import { mergeGuestIntoUser, requireUser, resolveIdentity } from "../auth/identity.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { clearSession, issueSession } from "../auth/session.js";
import { prisma } from "../db.js";
import { userToDTO } from "../dto.js";
import { errors } from "../errors.js";

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
    await issueSession(reply, user.id);
    const res: AuthResponse = { user: userToDTO(user) };
    return reply.status(201).send(res);
  });

  app.post("/auth/login", { config: { rateLimit: AUTH_RATE } }, async (request, reply) => {
    const body = loginSchema.parse(request.body ?? {});
    const identity = await resolveIdentity(request, reply);

    const user = await prisma.user.findUnique({ where: { email: body.email }, include: { subscription: true } });
    const ok = user ? await verifyPassword(body.password, user.passwordHash) : false;
    if (!user || !ok) throw errors.unauthorized("Wrong email or password.");

    await mergeGuestIntoUser(identity.guestId, user.id);
    await issueSession(reply, user.id);
    const res: AuthResponse = { user: userToDTO(user) };
    return res;
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
