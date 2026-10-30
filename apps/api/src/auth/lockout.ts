/**
 * Per-account login throttle. The route's IP rate limit stops one client
 * hammering; this stops many IPs guessing one account's password. Two tiers:
 * MAX_FAILURES wrong passwords for an email from one IP locks that pair only,
 * so a single client cannot lock a victim out of their own account; and
 * MAX_ACCOUNT_FAILURES from any IPs locks the email outright (a spray). Both
 * windows are WINDOW_MS. In-memory: one API
 * process (single-host deploy); a multi-instance deploy should move it to Postgres.
 */
export const MAX_FAILURES = 10;
export const MAX_ACCOUNT_FAILURES = 100;
export const WINDOW_MS = 15 * 60_000;
const MAX_TRACKED = 50_000;

const failures = new Map<string, number[]>();

function recent(email: string, now: number): number[] {
  const list = (failures.get(email) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length) failures.set(email, list);
  else failures.delete(email);
  return list;
}

const pairKey = (email: string, ipHash: string) => `${email}|${ipHash}`;

function waitFor(key: string, max: number, now: number): number {
  const list = recent(key, now);
  if (list.length < max) return 0;
  return Math.ceil((list[list.length - max]! + WINDOW_MS - now) / 1000);
}

/** Seconds until this email may try again from this IP, or 0 if it isn't locked. */
export function lockedForSeconds(email: string, ipHash: string, now = Date.now()): number {
  return Math.max(waitFor(pairKey(email, ipHash), MAX_FAILURES, now), waitFor(email, MAX_ACCOUNT_FAILURES, now));
}

export function recordFailure(email: string, ipHash: string, now = Date.now()): void {
  for (const key of [pairKey(email, ipHash), email]) {
    const list = recent(key, now);
    list.push(now);
    failures.set(key, list);
  }
  if (failures.size > MAX_TRACKED) {
    // Drop the oldest entries rather than grow without bound under a spray attack.
    for (const key of failures.keys()) {
      failures.delete(key);
      if (failures.size <= MAX_TRACKED * 0.9) break;
    }
  }
}

export function clearFailures(email: string, ipHash: string): void {
  failures.delete(email);
  failures.delete(pairKey(email, ipHash));
}

/** Test hook. */
export function resetLockouts(): void {
  failures.clear();
}
