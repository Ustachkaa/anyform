import type { Conversion, Subscription, User } from "@prisma/client";
import { getPlan, type ConversionDTO, type ConversionStatus, type SubscriptionDTO, type UserDTO } from "@anyform/shared";

/**
 * Prisma rows → wire DTOs. BigInt becomes Number (files are < 2^53 bytes),
 * dates become ISO strings, and `downloadUrl` is only present when the output
 * is actually downloadable right now.
 */

const STATUSES: readonly ConversionStatus[] = ["queued", "processing", "done", "failed"];

function asStatus(s: string): ConversionStatus {
  return (STATUSES as readonly string[]).includes(s) ? (s as ConversionStatus) : "failed";
}

export function downloadPath(id: string): string {
  return `/v1/conversions/${id}/download`;
}

export function conversionToDTO(row: Conversion, now: Date = new Date()): ConversionDTO {
  const status = asStatus(row.status);
  const expired = row.expiresAt.getTime() <= now.getTime();
  const downloadable = status === "done" && !!row.outputKey && !expired;
  return {
    id: row.id,
    status,
    progress: Math.max(0, Math.min(100, row.progress)),
    sourceName: row.sourceName,
    sourceExt: row.sourceExt,
    targetExt: row.targetExt,
    sourceBytes: Number(row.sourceBytes),
    outputBytes: row.outputBytes === null ? null : Number(row.outputBytes),
    outputName: row.outputName,
    engine: row.engine,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt.toISOString(),
    downloadUrl: downloadable ? downloadPath(row.id) : null,
  };
}

export function subscriptionToDTO(sub: Subscription): SubscriptionDTO {
  return {
    plan: getPlan(sub.plan).id,
    interval: sub.interval === "year" ? "year" : "month",
    status: sub.status,
    currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
  };
}

export function userToDTO(user: User & { subscription?: Subscription | null }): UserDTO {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
    name: user.name,
    plan: getPlan(user.plan).id,
    createdAt: user.createdAt.toISOString(),
    subscription: user.subscription ? subscriptionToDTO(user.subscription) : null,
  };
}
