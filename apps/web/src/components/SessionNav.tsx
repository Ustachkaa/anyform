"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AUTH_CHANGED_EVENT, getMe } from "@/lib/api";

/**
 * Header account link. Renders "Log in" immediately (most visitors are
 * guests) and swaps to "Dashboard" once the session check comes back, so
 * marketing pages can stay fully static. The header lives in the root layout
 * and is not remounted, so it re-checks on navigation, but at most once a
 * minute (every call counts against the per-IP rate limit, shared behind NAT);
 * signing in or out fires AUTH_CHANGED_EVENT, which re-checks at once.
 */
const RECHECK_MS = 60_000;
let cached: { state: "guest" | "user"; at: number } | undefined;
export function SessionNav() {
  const [state, setState] = useState<"unknown" | "guest" | "user">("unknown");
  const pathname = usePathname();

  useEffect(() => {
    let alive = true;
    const check = (force: boolean) => {
      if (!force && cached && Date.now() - cached.at < RECHECK_MS) {
        setState(cached.state);
        return;
      }
      getMe()
        .then((u) => {
          cached = { state: u ? "user" : "guest", at: Date.now() };
          if (alive) setState(cached.state);
        })
        .catch(() => alive && setState("guest"));
    };
    check(false);
    const onAuth = () => {
      cached = undefined; // so a navigation racing this check doesn't reuse the old answer
      check(true);
    };
    window.addEventListener(AUTH_CHANGED_EVENT, onAuth);
    return () => {
      alive = false;
      window.removeEventListener(AUTH_CHANGED_EVENT, onAuth);
    };
  }, [pathname]);

  if (state === "user") {
    return (
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 rounded-[4px] bg-ink px-3 py-1.5 text-sm font-medium text-paper transition-colors hover:bg-ink-2"
      >
        <span className="inline-block h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
        Dashboard
      </Link>
    );
  }
  return (
    <Link
      href="/login"
      className="inline-flex items-center rounded-[4px] border border-ink px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-ink hover:text-paper"
    >
      Log in
    </Link>
  );
}
