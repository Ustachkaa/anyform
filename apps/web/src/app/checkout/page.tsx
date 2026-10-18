import type { Metadata } from "next";
import { Suspense } from "react";
import { PaddleCheckout } from "@/components/PaddleCheckout";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

/** Paddle's default payment link points here; Paddle.js opens the overlay for `?_ptxn=`. */
export default function CheckoutPage() {
  return (
    <div className="mx-auto max-w-md px-4 pb-8 pt-12 sm:px-6 lg:pt-20">
      <p className="mono text-xs uppercase tracking-widest text-ink-3">checkout</p>
      <h1 className="display mt-2 text-4xl font-semibold tracking-tight">Almost there.</h1>
      <Suspense fallback={<p className="mono mt-4 text-sm text-ink-3">loading…</p>}>
        <PaddleCheckout />
      </Suspense>
    </div>
  );
}
