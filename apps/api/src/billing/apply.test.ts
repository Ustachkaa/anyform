import { describe, expect, it } from "vitest";
import { shouldApplySnapshot } from "./apply.js";
import type { SubscriptionSnapshot } from "./provider.js";

const t = (iso: string) => new Date(iso);
const snap = (over: Partial<SubscriptionSnapshot>): SubscriptionSnapshot => ({
  userId: "u-1",
  providerSubscriptionId: "sub_new",
  providerPriceId: "pri_1",
  plan: "pro",
  interval: "month",
  status: "active",
  currentPeriodEnd: t("2026-12-01T00:00:00Z"),
  cancelAtPeriodEnd: false,
  occurredAt: t("2026-10-30T12:00:00Z"),
  ...over,
});

describe("subscription webhook ordering", () => {
  it("applies the first event for a user", () => {
    expect(shouldApplySnapshot(null, snap({}))).toBe(true);
  });

  it("drops an event older than the stored state", () => {
    const stored = { providerSubscriptionId: "sub_new", status: "canceled", providerUpdatedAt: t("2026-10-30T13:00:00Z") };
    expect(shouldApplySnapshot(stored, snap({ status: "active" }))).toBe(false);
  });

  it("does not let cancelling the old plan wipe out the new active one", () => {
    const stored = { providerSubscriptionId: "sub_new", status: "active", providerUpdatedAt: t("2026-10-30T11:00:00Z") };
    expect(shouldApplySnapshot(stored, snap({ providerSubscriptionId: "sub_old", status: "canceled" }))).toBe(false);
  });

  it("applies newer events for the same subscription, including cancellation", () => {
    const stored = { providerSubscriptionId: "sub_new", status: "active", providerUpdatedAt: t("2026-10-30T11:00:00Z") };
    expect(shouldApplySnapshot(stored, snap({ status: "canceled" }))).toBe(true);
  });

  it("lets a new active subscription replace a canceled one", () => {
    const stored = { providerSubscriptionId: "sub_old", status: "canceled", providerUpdatedAt: t("2026-10-01T00:00:00Z") };
    expect(shouldApplySnapshot(stored, snap({}))).toBe(true);
  });
});
