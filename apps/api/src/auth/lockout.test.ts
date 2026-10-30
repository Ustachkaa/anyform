import { beforeEach, describe, expect, it } from "vitest";
import { clearFailures, lockedForSeconds, MAX_ACCOUNT_FAILURES, MAX_FAILURES, recordFailure, resetLockouts, WINDOW_MS } from "./lockout.js";

describe("per-account login lockout", () => {
  beforeEach(() => resetLockouts());
  const t0 = 1_800_000_000_000;

  it("locks an email for one IP after MAX_FAILURES wrong passwords", () => {
    for (let i = 0; i < MAX_FAILURES - 1; i++) recordFailure("a@example.com", "ip1", t0 + i);
    expect(lockedForSeconds("a@example.com", "ip1", t0 + 100)).toBe(0);
    recordFailure("a@example.com", "ip1", t0 + 200);
    expect(lockedForSeconds("a@example.com", "ip1", t0 + 300)).toBeGreaterThan(0);
    expect(lockedForSeconds("other@example.com", "ip1", t0 + 300)).toBe(0);
  });

  it("one IP cannot lock the owner out from elsewhere", () => {
    for (let i = 0; i < MAX_FAILURES * 2; i++) recordFailure("v@example.com", "attacker", t0);
    expect(lockedForSeconds("v@example.com", "attacker", t0 + 1)).toBeGreaterThan(0);
    expect(lockedForSeconds("v@example.com", "owner", t0 + 1)).toBe(0);
  });

  it("a spray from many IPs locks the account for everyone", () => {
    for (let i = 0; i < MAX_ACCOUNT_FAILURES; i++) recordFailure("s@example.com", `ip${i}`, t0);
    expect(lockedForSeconds("s@example.com", "fresh-ip", t0 + 1)).toBeGreaterThan(0);
  });

  it("unlocks when the window has passed, or after a successful login", () => {
    for (let i = 0; i < MAX_FAILURES; i++) recordFailure("b@example.com", "ip1", t0);
    expect(lockedForSeconds("b@example.com", "ip1", t0 + WINDOW_MS + 1)).toBe(0);
    for (let i = 0; i < MAX_FAILURES; i++) recordFailure("c@example.com", "ip1", t0);
    clearFailures("c@example.com", "ip1");
    expect(lockedForSeconds("c@example.com", "ip1", t0 + 1)).toBe(0);
  });
});
