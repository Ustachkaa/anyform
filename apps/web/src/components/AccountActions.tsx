"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { explainError, logout, portal } from "@/lib/api";

/** "Manage billing", "Account settings" and "Log out" for the dashboard. */
export function AccountActions({ paid }: { paid: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"portal" | "logout" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const openPortal = async () => {
    setBusy("portal");
    setMessage(null);
    try {
      const { url } = await portal();
      window.location.assign(url);
    } catch (e) {
      setMessage(explainError(e));
      setBusy(null);
    }
  };

  const doLogout = async () => {
    setBusy("logout");
    try {
      await logout();
    } finally {
      router.push("/");
      router.refresh();
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {paid ? (
        <button
          type="button"
          onClick={openPortal}
          disabled={busy !== null}
          className="rounded-[4px] border border-ink px-4 py-2 text-sm font-medium text-ink hover:bg-ink hover:text-paper disabled:opacity-60"
        >
          {busy === "portal" ? "Opening…" : "Manage billing"}
        </button>
      ) : null}
      <Link href="/account" className="rounded-[4px] border border-line px-4 py-2 text-sm text-ink hover:border-ink">
        Account settings
      </Link>
      <button
        type="button"
        onClick={doLogout}
        disabled={busy !== null}
        className="rounded-[4px] px-3 py-2 text-sm text-ink-3 hover:text-ink disabled:opacity-60"
      >
        Log out
      </button>
      {message && <p className="text-sm text-bad">{message}</p>}
    </div>
  );
}
