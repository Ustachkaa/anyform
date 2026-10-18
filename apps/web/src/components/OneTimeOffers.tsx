"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ONE_TIME_PRODUCTS, type OneTimeProductId } from "@anyform/shared";
import { ApiClientError, checkoutProduct, explainError } from "@/lib/api";

const ORDER: readonly OneTimeProductId[] = ["pack", "pass"];

/** "Pay once" cards: conversion pack and 24-hour pass, for people who won't subscribe. */
export function OneTimeOffers({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<OneTimeProductId | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const buy = async (product: OneTimeProductId) => {
    setMessage(null);
    setBusy(product);
    try {
      const { url } = await checkoutProduct(product);
      window.location.assign(url);
    } catch (e) {
      if (e instanceof ApiClientError && (e.code === "UNAUTHORIZED" || e.status === 401)) {
        router.push(`/signup?product=${product}`);
        return;
      }
      setMessage(explainError(e));
      setBusy(null);
    }
  };

  return (
    <section id="pay-once" aria-labelledby="pay-once-title" className={className}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mono text-xs uppercase tracking-widest text-ink-3">no subscription</p>
          <h2 id="pay-once-title" className="display mt-1 text-3xl font-semibold tracking-tight">
            Or pay once.
          </h2>
        </div>
        <p className="max-w-md text-sm text-ink-2">Need a few more files, or one busy day? Nothing renews and nothing to cancel.</p>
      </div>
      {message && (
        <p role="alert" className="mx-auto mt-4 max-w-md rounded-[4px] border border-bad/40 bg-bad/5 px-3 py-2 text-center text-sm text-bad">
          {message}
        </p>
      )}
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {ORDER.map((id) => {
          const p = ONE_TIME_PRODUCTS[id];
          return (
            <div key={id} className="flex flex-col rounded-[6px] border border-line bg-paper-2 p-6">
              <p className="text-lg font-semibold">{p.name}</p>
              <p className="text-sm text-ink-2">{p.tagline}</p>
              <p className="mt-4">
                <span className="display text-4xl font-semibold">${p.price.toFixed(2)}</span>
                <span className="mono ml-1 text-xs text-ink-3">once</span>
              </p>
              <ul className="mt-4 space-y-1.5 text-sm text-ink-2">
                {p.features.map((f) => (
                  <li key={f}>
                    <span aria-hidden="true">→ </span>
                    {f}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => buy(id)}
                disabled={busy !== null}
                className="mt-6 inline-flex items-center justify-center rounded-[4px] border border-ink px-5 py-2.5 text-sm font-medium text-ink hover:bg-ink hover:text-paper disabled:opacity-60"
              >
                {busy === id ? "Opening checkout…" : `Buy ${p.name.toLowerCase()}`}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
