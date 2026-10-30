"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { verifyEmailSchema } from "@anyform/shared";
import { explainError, resendVerification, verifyEmail } from "@/lib/api";

/** The link from the confirmation email lands here with ?token=… and is spent at once. */
export function VerifyEmail() {
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<{ kind: "working" | "done" | "error"; text?: string }>({ kind: "working" });
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return; // StrictMode runs effects twice; the token works once
    sent.current = true;
    const parsed = verifyEmailSchema.safeParse({ token });
    if (!parsed.success) return setState({ kind: "error", text: "This page needs the link from your confirmation email." });
    verifyEmail(parsed.data)
      .then(() => setState({ kind: "done" }))
      .catch((err) => setState({ kind: "error", text: explainError(err) }));
  }, [token]);

  if (state.kind === "working") return <p className="mono text-sm text-ink-3">confirming…</p>;
  if (state.kind === "done") {
    return (
      <div className="space-y-4" role="status">
        <p className="text-base text-ink">Email confirmed. Thanks.</p>
        <Link href="/dashboard" className="link-ink text-sm">
          Go to your dashboard
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <p role="alert" className="rounded-[4px] border border-bad/40 bg-bad/5 px-3 py-2 text-sm text-bad">
        {state.text}
      </p>
      <Link href="/dashboard" className="link-ink text-sm">
        Send a new link from your dashboard
      </Link>
    </div>
  );
}

/** Dashboard notice while the account's email is unconfirmed. */
export function VerifyEmailNotice({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "busy" | "sent" | string>("idle");

  const resend = async () => {
    setState("busy");
    try {
      await resendVerification();
      setState("sent");
    } catch (err) {
      setState(explainError(err));
    }
  };

  return (
    <div role="status" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-line bg-accent/20 px-4 py-3 text-sm text-ink">
      <p>
        Confirm <span className="mono">{email}</span> to buy a plan or pack. Check your inbox for our link.
        {state !== "idle" && state !== "busy" && state !== "sent" && <span className="block text-bad">{state}</span>}
      </p>
      {state === "sent" ? (
        <span className="mono text-xs text-ink-2">sent. it can take a minute.</span>
      ) : (
        <button type="button" onClick={resend} disabled={state === "busy"} className="rounded-[4px] border border-ink px-3 py-1.5 text-sm font-medium hover:bg-ink hover:text-paper disabled:opacity-60">
          {state === "busy" ? "Sending…" : "Send a new link"}
        </button>
      )}
    </div>
  );
}
