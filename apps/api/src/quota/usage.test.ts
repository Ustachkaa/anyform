import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { monthlyPeriodStart, nextMonthlyReset } from "@anyform/shared";

const count = vi.fn();

vi.mock("../db.js", () => ({
  prisma: { conversion: { count: (...a: unknown[]) => count(...a) } },
}));

async function load(period: "lifetime" | "monthly") {
  vi.resetModules();
  vi.stubEnv("FREE_QUOTA_PERIOD", period);
  vi.stubEnv("FREE_CONVERSIONS", "10");
  return import("./usage.js");
}

const guest = { guestId: "g-1", plan: "free" as const, ipHash: "x" };
const user = { userId: "u-1", guestId: "g-1", plan: "free" as const, ipHash: "x" };

describe("quota period math", () => {
  beforeEach(() => count.mockReset());
  afterEach(() => vi.unstubAllEnvs());

  it("computes UTC month boundaries", () => {
    const now = new Date("2026-09-17T15:00:00Z");
    expect(monthlyPeriodStart(now).toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(nextMonthlyReset(now).toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(nextMonthlyReset(new Date("2026-12-05T00:00:00Z")).toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("lifetime: counts every non-failed conversion for a guest", async () => {
    const { countUsed } = await load("lifetime");
    count.mockResolvedValue(4);
    await expect(countUsed(guest)).resolves.toBe(4);
    const where = count.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(where.where).toMatchObject({ guestId: "g-1", status: { not: "failed" } });
    // Rows since claimed by an account still count for this browser.
    expect(where.where).not.toHaveProperty("userId");
    expect(where.where.createdAt).toBeUndefined();
  });

  it("monthly: only counts conversions since the start of the month, keyed by user when logged in", async () => {
    const { countUsed } = await load("monthly");
    count.mockResolvedValue(2);
    const now = new Date("2026-09-17T15:00:00Z");
    await countUsed(user, now);
    const where = count.mock.calls[0]?.[0] as { where: { userId?: string; createdAt?: { gte: Date } } };
    expect(where.where.userId).toBe("u-1");
    expect(where.where.createdAt?.gte.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("buildUsage reports remaining, exhaustion and reset date", async () => {
    const { buildUsage } = await load("monthly");
    count.mockResolvedValue(10);
    const usage = await buildUsage(guest, new Date("2026-09-17T15:00:00Z"));
    expect(usage.limit).toBe(10);
    expect(usage.remaining).toBe(0);
    expect(usage.exhausted).toBe(true);
    expect(usage.resetsAt).toBe("2026-10-01T00:00:00.000Z");
    expect(usage.maxFileBytes).toBe(100 * 1024 * 1024);
  });

  it("paid plans skip the count entirely", async () => {
    const { buildUsage } = await load("lifetime");
    const usage = await buildUsage({ ...user, plan: "pro" });
    expect(count).not.toHaveBeenCalled();
    expect(usage.limit).toBeNull();
    expect(usage.exhausted).toBe(false);
  });
});
