"use client";

import Link from "next/link";
import Script from "next/script";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { PADDLE_CLIENT_TOKEN, PADDLE_ENV } from "@/lib/site";

interface PaddleGlobal {
  Environment: { set(env: "sandbox"): void };
  Initialize(opts: {
    token: string;
    checkout?: { settings?: { displayMode?: "overlay"; theme?: "light"; successUrl?: string } };
    eventCallback?: (e: { name?: string }) => void;
  }): void;
}

/**
 * Opens Paddle's checkout overlay for the transaction in `?_ptxn=` (Paddle.js
 * does this by itself once initialised). Card details never touch Anyform.
 */
export function PaddleCheckout() {
  const txn = useSearchParams().get("_ptxn");
  const [state, setState] = useState<"loading" | "open" | "closed" | "error">("loading");

  if (!txn || !/^txn_[a-z0-9]+$/.test(txn)) {
    return (
      <p className="mt-4 text-sm text-ink-2">
        This page opens a checkout started from{" "}
        <Link href="/pricing" className="link-ink">
          pricing
        </Link>
        .
      </p>
    );
  }
  if (!PADDLE_CLIENT_TOKEN) {
    return (
      <p role="alert" className="mt-4 rounded-[4px] border border-bad/40 bg-bad/5 px-3 py-2 text-sm text-bad">
        Payments aren't switched on for this deployment yet.
      </p>
    );
  }

  const init = () => {
    const paddle = (window as unknown as { Paddle?: PaddleGlobal }).Paddle;
    if (!paddle) return setState("error");
    if (PADDLE_ENV === "sandbox") paddle.Environment.set("sandbox");
    paddle.Initialize({
      token: PADDLE_CLIENT_TOKEN,
      checkout: { settings: { displayMode: "overlay", theme: "light", successUrl: `${window.location.origin}/dashboard?checkout=success` } },
      eventCallback: (e) => {
        if (e.name === "checkout.loaded") setState("open");
        if (e.name === "checkout.closed") setState("closed");
        if (e.name === "checkout.error") setState("error");
      },
    });
  };

  return (
    <>
      <Script src="https://cdn.paddle.com/paddle/v2/paddle.js" strategy="afterInteractive" onLoad={init} onError={() => setState("error")} />
      <p className="mt-4 text-sm text-ink-2" role="status">
        {state === "loading" && "Opening secure checkout…"}
        {state === "open" && "Complete your payment in the checkout window. Payments are handled by Paddle, our reseller."}
        {state === "closed" && (
          <>
            Checkout closed.{" "}
            <Link href="/pricing" className="link-ink">
              Back to pricing
            </Link>
          </>
        )}
        {state === "error" && "The checkout couldn't open. Disable blockers for this page or try again in a minute."}
      </p>
    </>
  );
}
