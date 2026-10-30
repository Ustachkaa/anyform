import { cookies } from "next/headers";
import type { AuthResponse, UsageDTO, UserDTO } from "@anyform/shared";
import { API_INTERNAL_URL } from "./site";

/**
 * Server-side helpers for server components. They forward the visitor's
 * cookies to the API directly (not via the /api rewrite) and never cache.
 * Any page that calls these becomes dynamic, so only the dashboard should.
 */

async function cookieHeader(): Promise<string> {
  const store = await cookies();
  return store
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

/** null for 401 (not signed in); throws when the API is down or erroring. */
async function apiGetStrict<T>(path: string): Promise<T | null> {
  const cookie = await cookieHeader();
  const res = await fetch(`${API_INTERNAL_URL}/v1${path}`, {
    headers: { Accept: "application/json", ...(cookie ? { cookie } : {}) },
    cache: "no-store",
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`API ${path} answered ${res.status}`);
  return (await res.json()) as T;
}

/**
 * The signed-in user, or null when there is no valid session. An API outage
 * throws (to the error page) instead: treating it as "logged out" bounced
 * signed-in people to /login whenever the API hiccuped.
 */
export async function getSessionUser(): Promise<UserDTO | null> {
  const r = await apiGetStrict<AuthResponse>("/auth/me");
  return r?.user ?? null;
}

/** Usage for the meter; null on any failure, since the page renders fine without it. */
export async function getServerUsage(): Promise<UsageDTO | null> {
  return apiGetStrict<UsageDTO>("/usage").catch(() => null);
}
