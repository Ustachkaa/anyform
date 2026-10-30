import type { Metadata } from "next";
import { Suspense } from "react";
import { VerifyEmail } from "@/components/EmailVerification";

export const metadata: Metadata = { title: "Confirm your email", robots: { index: false }, referrer: "no-referrer" };

export default function VerifyEmailPage() {
  return (
    <div className="mx-auto max-w-md px-4 pb-8 pt-12 sm:px-6 lg:pt-20">
      <p className="mono text-xs uppercase tracking-widest text-ink-3">account</p>
      <h1 className="display mt-2 text-4xl font-semibold tracking-tight">Confirm your email.</h1>
      <div className="ticket-edge mt-8 rounded-[6px] border border-line bg-paper-2 p-6">
        <Suspense fallback={<p className="mono text-sm text-ink-3">loading…</p>}>
          <VerifyEmail />
        </Suspense>
      </div>
    </div>
  );
}
