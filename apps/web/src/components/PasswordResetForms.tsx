"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { forgotPasswordSchema, resetPasswordSchema } from "@anyform/shared";
import { ApiClientError, explainError, forgotPassword, resetPassword } from "@/lib/api";

const input =
  "mt-1 w-full rounded-[4px] border border-line bg-paper px-3 py-2.5 text-base text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none focus-visible:outline-none";
const submit =
  "inline-flex w-full items-center justify-center rounded-[4px] bg-ink px-5 py-3 text-base font-medium text-paper transition-transform enabled:hover:-translate-y-0.5 disabled:opacity-60";

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-[4px] border border-bad/40 bg-bad/5 px-3 py-2 text-sm text-bad">
      {children}
    </p>
  );
}

/** Step 1: ask for the email. The answer is the same whether or not an account exists. */
export function ForgotPasswordForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Enter a valid email address");
    setBusy(true);
    try {
      await forgotPassword(parsed.data);
      setSentTo(parsed.data.email);
    } catch (err) {
      setError(explainError(err));
    } finally {
      setBusy(false);
    }
  };

  if (sentTo) {
    return (
      <div className="space-y-4" role="status">
        <p className="text-base text-ink">Check your inbox.</p>
        <p className="text-sm text-ink-2">
          If <span className="mono text-ink">{sentTo}</span> has an Anyform account, we've sent it a link to choose a new password. The link works
          once, for 60 minutes. Nothing there? Check spam, or try again in a minute.
        </p>
        <p className="text-sm">
          <Link href="/login" className="link-ink">
            Back to log in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <label className="block text-sm text-ink-2">
        Email
        <input className={input} type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      {error && <Alert>{error}</Alert>}
      <button type="submit" disabled={busy} className={submit}>
        {busy ? "One moment…" : "Send reset link"}
      </button>
      <p className="text-center text-sm text-ink-2">
        Remembered it?{" "}
        <Link href="/login" className="link-ink">
          Log in
        </Link>
      </p>
    </form>
  );
}

/** Step 2: the link from the email lands here with ?token=… */
export function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!token) {
    return (
      <div className="space-y-4">
        <Alert>This page needs the link from your reset email.</Alert>
        <Link href="/forgot-password" className="link-ink text-sm">
          Ask for a new link
        </Link>
      </div>
    );
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) return setError("The two passwords don't match.");
    const parsed = resetPasswordSchema.safeParse({ token, password });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      if (issue?.path[0] === "token") setExpired(true);
      return setError(issue?.message ?? "Check the password and try again.");
    }
    setBusy(true);
    try {
      await resetPassword(parsed.data);
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "VALIDATION" && (err.details as { field?: string } | undefined)?.field === "token") setExpired(true);
      setError(explainError(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <label className="block text-sm text-ink-2">
        New password
        <input className={input} type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        <span className="mono mt-1 block text-xs text-ink-3">8+ characters</span>
      </label>
      <label className="block text-sm text-ink-2">
        Repeat new password
        <input className={input} type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </label>
      {error && (
        <Alert>
          {error}{" "}
          {expired && (
            <Link href="/forgot-password" className="underline">
              Get a new link
            </Link>
          )}
        </Alert>
      )}
      <button type="submit" disabled={busy} className={submit}>
        {busy ? "Saving…" : "Set new password and log in"}
      </button>
      <p className="text-xs text-ink-3">This signs you out on every other device.</p>
    </form>
  );
}
