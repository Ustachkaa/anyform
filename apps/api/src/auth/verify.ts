import { randomBytes } from "node:crypto";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { getMailer, verifyEmailMail } from "../mail/index.js";
import { hashResetToken } from "./reset.js";

/** How long a verification link works. */
export const VERIFY_TTL_HOURS = 24;
/** A second request inside this window does not send another email. */
const RESEND_COOLDOWN_MS = 60_000;

/**
 * Email the account's current address a one-time link proving the owner reads
 * it. The token is bound to that address, so changing the email again voids
 * it. Silent when the user is gone or already verified.
 */
export async function sendVerificationLink(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, emailVerifiedAt: true } });
  if (!user || user.emailVerifiedAt) return;

  const recent = await prisma.emailVerification.findFirst({
    where: { userId: user.id, email: user.email, usedAt: null, createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_MS) } },
    select: { id: true },
  });
  if (recent) return;

  const token = randomBytes(32).toString("base64url");
  await prisma.$transaction([
    prisma.emailVerification.deleteMany({ where: { userId: user.id, usedAt: null } }),
    prisma.emailVerification.create({
      data: { userId: user.id, email: user.email, tokenHash: hashResetToken(token), expiresAt: new Date(Date.now() + VERIFY_TTL_HOURS * 3_600_000) },
    }),
  ]);

  const link = `${config.WEB_ORIGIN.replace(/\/$/, "")}/verify-email?token=${token}`;
  await getMailer().send(verifyEmailMail(user.email, link, VERIFY_TTL_HOURS));
}

/**
 * Spend a verification token. True when it marked (or had already marked) the
 * address it was sent to as verified; false when it is unknown, expired, used,
 * or the account's email has changed since.
 */
export async function consumeVerificationToken(token: string, now = new Date()): Promise<boolean> {
  const row = await prisma.emailVerification.findUnique({ where: { tokenHash: hashResetToken(token) }, include: { user: { select: { email: true } } } });
  if (!row || row.usedAt || row.expiresAt.getTime() < now.getTime() || row.user.email !== row.email) return false;
  // Conditional on the email so a change racing this click can't verify the new address.
  const [marked] = await prisma.$transaction([
    prisma.user.updateMany({ where: { id: row.userId, email: row.email }, data: { emailVerifiedAt: now } }),
    prisma.emailVerification.update({ where: { id: row.id }, data: { usedAt: now } }),
    prisma.emailVerification.deleteMany({ where: { userId: row.userId, id: { not: row.id } } }),
  ]);
  return marked.count === 1;
}
