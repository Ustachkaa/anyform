import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/PasswordResetForms";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false }, referrer: "no-referrer" };

export default function ResetPasswordPage() {
  return (
    <div className="mx-auto max-w-md px-4 pb-8 pt-12 sm:px-6 lg:pt-20">
      <p className="mono text-xs uppercase tracking-widest text-ink-3">account</p>
      <h1 className="display mt-2 text-4xl font-semibold tracking-tight">Choose a new password.</h1>
      <p className="mt-2 text-sm text-ink-2">You'll be logged in straight after.</p>
      <div className="ticket-edge mt-8 rounded-[6px] border border-line bg-paper-2 p-6">
        <Suspense fallback={<p className="mono text-sm text-ink-3">loading…</p>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
