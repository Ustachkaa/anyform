import { beforeEach, describe, expect, it } from "vitest";
import { clearFailures, lockedForSeconds, MAX_FAILURES, recordFailure, resetLockouts, WINDOW_MS } from "./lockout.js";

describe("per-account login lockout", () => {
  beforeEach(() => resetLockouts());
  const t0 = 1_800_000_000_000;

  it("locks an email after MAX_FAILURES wrong passwords", () => {
    for (let i = 0; i < MAX_FAILURES - 1; i++) recordFailure("a@example.com", t0 + i);
    expect(lockedForSeconds("a@example.com", t0 + 100)).toBe(0);
    recordFailure("a@example.com", t0 + 200);
    expect(lockedForSeconds("a@example.com", t0 + 300)).toBeGreaterThan(0);
    expect(lockedForSeconds("other@example.com", t0 + 300)).toBe(0);
  });

  it("unlocks when the window has passed, or after a successful login", () => {
    for (let i = 0; i < MAX_FAILURES; i++) recordFailure("b@example.com", t0);
    expect(lockedForSeconds("b@example.com", t0 + WINDOW_MS + 1)).toBe(0);
    for (let i = 0; i < MAX_FAILURES; i++) recordFailure("c@example.com", t0);
    clearFailures("c@example.com");
    expect(lockedForSeconds("c@example.com", t0 + 1)).toBe(0);
  });
});
