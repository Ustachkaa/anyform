import type { FastifyPluginAsync } from "fastify";
import { changePasswordSchema, deleteAccountSchema, updateProfileSchema, type AuthResponse } from "@anyform/shared";
import { Prisma } from "@prisma/client";
import { currentUserId, requireUser } from "../auth/identity.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { clearSession, issueSession } from "../auth/session.js";
import { ACTIVE_STATUSES } from "../billing/provider.js";
import { prisma } from "../db.js";
import { userToDTO } from "../dto.js";
import { errors } from "../errors.js";
import { getStorage } from "../storage/index.js";

const ACCOUNT_RATE = { max: 10, timeWindow: "15 minutes" };

async function loadUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { subscription: true } });
  if (!user) throw errors.unauthorized();
  return user;
}

/** Signed-in self-service: profile, password, account deletion. */
export const accountRoutes: FastifyPluginAsync = async (app) => {
  app.patch("/account", { preHandler: [requireUser], config: { rateLimit: ACCOUNT_RATE } }, async (request) => {
    const body = updateProfileSchema.parse(request.body ?? {});
    const user = await loadUser(currentUserId(request));

    const data: Prisma.UserUpdateInput = {};
    if (body.name !== undefined) data.name = body.name ? body.name : null;
    if (body.email !== undefined && body.email !== user.email) {
      if (!(await verifyPassword(body.currentPassword ?? "", user.passwordHash))) {
        throw errors.validation("That isn't your current password.", { field: "currentPassword" });
      }
      data.email = body.email;
      // Reset links already mailed to the old address must stop working.
      data.passwordResets = { deleteMany: {} };
    }

    try {
      const updated = await prisma.user.update({ where: { id: user.id }, data, include: { subscription: true } });
      const res: AuthResponse = { user: userToDTO(updated) };
      return res;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw errors.conflict("Another account already uses that email.", { field: "email" });
      }
      throw err;
    }
  });

  /** Changes the password and signs out every other device; this one gets a fresh session. */
  app.post("/account/password", { preHandler: [requireUser], config: { rateLimit: ACCOUNT_RATE } }, async (request, reply) => {
    const body = changePasswordSchema.parse(request.body ?? {});
    const user = await loadUser(currentUserId(request));
    if (!(await verifyPassword(body.currentPassword, user.passwordHash))) {
      throw errors.validation("That isn't your current password.", { field: "currentPassword" });
    }
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(body.newPassword), sessionVersion: { increment: 1 } },
      include: { subscription: true },
    });
    await prisma.passwordReset.deleteMany({ where: { userId: user.id } });
    await issueSession(reply, updated.id, updated.sessionVersion);
    const res: AuthResponse = { user: userToDTO(updated) };
    return res;
  });

  /**
   * Deletes the account, its files and its conversion history. Refused while a
   * paid subscription is active so nobody keeps getting billed for an account
   * that no longer exists; cancelling in "Manage billing" comes first.
   */
  app.delete("/account", { preHandler: [requireUser], config: { rateLimit: ACCOUNT_RATE } }, async (request, reply) => {
    const body = deleteAccountSchema.parse(request.body ?? {});
    const user = await loadUser(currentUserId(request));
    if (!(await verifyPassword(body.password, user.passwordHash))) {
      throw errors.validation("That isn't your password.", { field: "password" });
    }
    if (user.subscription && ACTIVE_STATUSES.has(user.subscription.status) && !user.subscription.cancelAtPeriodEnd) {
      throw errors.conflict("Cancel your subscription in Manage billing before deleting your account.", { reason: "active_subscription" });
    }

    const storage = getStorage();
    const files = await prisma.conversion.findMany({ where: { userId: user.id }, select: { sourceKey: true, outputKey: true } });
    for (const key of files.flatMap((f) => [f.sourceKey, f.outputKey])) {
      if (!key) continue;
      await storage.delete(key).catch((err: unknown) => request.log.warn({ err, key }, "could not delete file during account deletion"));
    }
    await prisma.$transaction([prisma.conversion.deleteMany({ where: { userId: user.id } }), prisma.user.delete({ where: { id: user.id } })]);

    clearSession(reply);
    return reply.status(204).send();
  });
};
