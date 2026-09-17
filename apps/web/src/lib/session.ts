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

async function apiGet<T>(path: string): Promise<T | null> {
  const cookie = await cookieHeader();
  try {
    const res = await fetch(`${API_INTERNAL_URL}/v1${path}`, {
      headers: { Accept: "application/json", ...(cookie ? { cookie } : {}) },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function getSessionUser(): Promise<UserDTO | null> {
  const r = await apiGet<AuthResponse>("/auth/me");
  return r?.user ?? null;
}

export async function getServerUsage(): Promise<UsageDTO | null> {
  return apiGet<UsageDTO>("/usage");
}
