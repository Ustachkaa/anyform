import { createHash, randomBytes } from "node:crypto";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { getMailer, passwordResetMail } from "../mail/index.js";

/** How long a reset link works. */
export const RESET_TTL_MINUTES = 60;
/** A second request inside this window does not send another email (stops inbox flooding). */
const RESEND_COOLDOWN_MS = 60_000;

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Create a one-time token for the account with this email (if any) and email
 * the link. Only the token's hash is stored; earlier unused links are revoked
 * so only the newest one works. Silent when the email has no account.
 */
export async function sendResetLink(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true } });
  if (!user) return;

  const recent = await prisma.passwordReset.findFirst({
    where: { userId: user.id, usedAt: null, createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_MS) } },
    select: { id: true },
  });
  if (recent) return;

  const token = randomBytes(32).toString("base64url");
  await prisma.$transaction([
    prisma.passwordReset.deleteMany({ where: { userId: user.id, usedAt: null } }),
    prisma.passwordReset.create({
      data: { userId: user.id, tokenHash: hashResetToken(token), expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60_000) },
    }),
  ]);

  const link = `${config.WEB_ORIGIN.replace(/\/$/, "")}/reset-password?token=${token}`;
  await getMailer().send(passwordResetMail(user.email, link, RESET_TTL_MINUTES));
}
