/**
 * Per-account login throttle. The route's IP rate limit stops one client
 * hammering; this stops many IPs guessing one account's password. After
 * MAX_FAILURES wrong passwords for an email within WINDOW_MS, further logins
 * for that email are refused until the window passes. In-memory: one API
 * process (single-host deploy); a multi-instance deploy should move it to Postgres.
 */
export const MAX_FAILURES = 10;
export const WINDOW_MS = 15 * 60_000;
const MAX_TRACKED = 50_000;

const failures = new Map<string, number[]>();

function recent(email: string, now: number): number[] {
  const list = (failures.get(email) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length) failures.set(email, list);
  else failures.delete(email);
  return list;
}

/** Seconds until this email may try again, or 0 if it isn't locked. */
export function lockedForSeconds(email: string, now = Date.now()): number {
  const list = recent(email, now);
  if (list.length < MAX_FAILURES) return 0;
  return Math.ceil((list[list.length - MAX_FAILURES]! + WINDOW_MS - now) / 1000);
}

export function recordFailure(email: string, now = Date.now()): void {
  const list = recent(email, now);
  list.push(now);
  failures.set(email, list);
  if (failures.size > MAX_TRACKED) {
    // Drop the oldest entries rather than grow without bound under a spray attack.
    for (const key of failures.keys()) {
      failures.delete(key);
      if (failures.size <= MAX_TRACKED * 0.9) break;
    }
  }
}

export function clearFailures(email: string): void {
  failures.delete(email);
}

/** Test hook. */
export function resetLockouts(): void {
  failures.clear();
}
