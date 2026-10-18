"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getMe } from "@/lib/api";

/**
 * Header account link. Renders "Log in" immediately (most visitors are
 * guests) and swaps to "Dashboard" once the session check comes back, so
 * marketing pages can stay fully static. Re-checked on every navigation: the
 * header lives in the root layout and is not remounted, so a check made once
 * would keep showing "Log in" after signing in (or "Dashboard" after logout).
 */
export function SessionNav() {
  const [state, setState] = useState<"unknown" | "guest" | "user">("unknown");
  const pathname = usePathname();

  useEffect(() => {
    let alive = true;
    getMe()
      .then((u) => alive && setState(u ? "user" : "guest"))
      .catch(() => alive && setState("guest"));
    return () => {
      alive = false;
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
