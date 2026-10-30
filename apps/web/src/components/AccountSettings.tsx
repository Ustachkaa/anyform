"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { changePasswordSchema, emailSchema, type UserDTO } from "@anyform/shared";
import { ApiClientError, changePassword, deleteAccount, explainError, updateProfile } from "@/lib/api";

const input =
  "mt-1 w-full rounded-[4px] border border-line bg-paper px-3 py-2.5 text-base text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none focus-visible:outline-none";
const primary =
  "inline-flex items-center justify-center rounded-[4px] bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-transform enabled:hover:-translate-y-0.5 disabled:opacity-60";

type Status = { kind: "ok" | "error"; text: string } | null;

function StatusLine({ status }: { status: Status }) {
  if (!status) return null;
  return status.kind === "ok" ? (
    <p role="status" className="text-sm text-ink-2">
      {status.text}
    </p>
  ) : (
    <p role="alert" className="rounded-[4px] border border-bad/40 bg-bad/5 px-3 py-2 text-sm text-bad">
      {status.text}
    </p>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-[6px] border border-line bg-paper-2 p-6">
      <h2 id={id} className="mono text-xs uppercase tracking-widest text-ink-3">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ProfileForm({ user }: { user: UserDTO }) {
  const router = useRouter();
  const [name, setName] = useState(user.name ?? "");
  const [email, setEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const emailChanged = email.trim().toLowerCase() !== user.email;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus(null);
    if (emailChanged && !emailSchema.safeParse(email).success) return setStatus({ kind: "error", text: "Enter a valid email address" });
    if (emailChanged && !currentPassword) return setStatus({ kind: "error", text: "Enter your current password to change your email." });
    setBusy(true);
    try {
      await updateProfile({
        name: name.trim() || null,
        ...(emailChanged ? { email, currentPassword } : {}),
      });
      setCurrentPassword("");
      setStatus({ kind: "ok", text: emailChanged ? `Saved. We sent a confirmation link to ${email.trim()}.` : "Saved." });
      router.refresh();
    } catch (err) {
      setStatus({ kind: "error", text: explainError(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <label className="block text-sm text-ink-2">
        Name <span className="text-ink-3">(optional)</span>
        <input className={input} type="text" autoComplete="name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="block text-sm text-ink-2">
        Email
        <input className={input} type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      {emailChanged && (
        <label className="block text-sm text-ink-2">
          Current password <span className="text-ink-3">(needed to change your email)</span>
          <input className={input} type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        </label>
      )}
      <StatusLine status={status} />
      <button type="submit" disabled={busy} className={primary}>
        {busy ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}

function PasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus(null);
    if (newPassword !== confirm) return setStatus({ kind: "error", text: "The two new passwords don't match." });
    const parsed = changePasswordSchema.safeParse({ currentPassword, newPassword });
    if (!parsed.success) return setStatus({ kind: "error", text: parsed.error.issues[0]?.message ?? "Check the passwords and try again." });
    setBusy(true);
    try {
      await changePassword(parsed.data);
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      setStatus({ kind: "ok", text: "Password changed. Other devices have been signed out." });
    } catch (err) {
      setStatus({ kind: "error", text: explainError(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <label className="block text-sm text-ink-2">
        Current password
        <input className={input} type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
      </label>
      <label className="block text-sm text-ink-2">
        New password
        <input className={input} type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        <span className="mono mt-1 block text-xs text-ink-3">8+ characters. Changing it signs you out everywhere else.</span>
      </label>
      <label className="block text-sm text-ink-2">
        Repeat new password
        <input className={input} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </label>
      <StatusLine status={status} />
      <button type="submit" disabled={busy} className={primary}>
        {busy ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}

function DeleteForm({ email }: { email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const confirmed = typed.trim().toLowerCase() === email;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus(null);
    if (!confirmed || !password) return;
    setBusy(true);
    try {
      await deleteAccount({ password });
      router.push("/");
      router.refresh();
    } catch (err) {
      const reason = err instanceof ApiClientError ? (err.details as { reason?: string } | undefined)?.reason : undefined;
      setStatus({
        kind: "error",
        text: reason === "active_subscription" ? "You still have an active subscription. Cancel it from Manage billing on your dashboard first, then delete the account." : explainError(err),
      });
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-ink-2">Deletes your account, your conversion history and every stored file. This can't be undone.</p>
        <button type="button" onClick={() => setOpen(true)} className="rounded-[4px] border border-bad/60 px-4 py-2 text-sm font-medium text-bad hover:bg-bad/5">
          Delete account…
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <p className="text-sm text-ink-2">
        This permanently deletes your account, history and files. Type <span className="mono text-ink">{email}</span> to confirm.
      </p>
      <label className="block text-sm text-ink-2">
        Your email
        <input className={input} type="email" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
      </label>
      <label className="block text-sm text-ink-2">
        Password
        <input className={input} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <StatusLine status={status} />
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={busy || !confirmed || !password}
          className="inline-flex items-center justify-center rounded-[4px] bg-bad px-5 py-2.5 text-sm font-medium text-paper disabled:opacity-50"
        >
          {busy ? "Deleting…" : "Delete my account"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="px-3 py-2 text-sm text-ink-3 hover:text-ink">
          Cancel
        </button>
      </div>
    </form>
  );
}

export function AccountSettings({ user }: { user: UserDTO }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section id="profile" title="profile">
        <ProfileForm user={user} />
      </Section>
      <Section id="password" title="password">
        <PasswordForm />
      </Section>
      <div className="lg:col-span-2">
        <Section id="danger" title="delete account">
          <DeleteForm email={user.email} />
        </Section>
      </div>
    </div>
  );
}
