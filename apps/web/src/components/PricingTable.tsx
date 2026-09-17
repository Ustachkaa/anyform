"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  PLANS,
  PLAN_ORDER,
  formatBytes,
  formatRetention,
  yearlySavingsPct,
  yearlyTotal,
  type BillingInterval,
  type Plan,
  type PlanId,
} from "@anyform/shared";
import { ApiClientError, checkout, explainError } from "@/lib/api";

export function PricingTable({ className = "" }: { className?: string }) {
  const [interval, setInterval] = useState<BillingInterval>("month");
  const [busy, setBusy] = useState<PlanId | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  const buy = async (plan: PlanId) => {
    setMessage(null);
    setBusy(plan);
    try {
      const { url } = await checkout(plan, interval);
      window.location.assign(url);
    } catch (e) {
      if (e instanceof ApiClientError && (e.code === "UNAUTHORIZED" || e.status === 401)) {
        router.push(`/signup?plan=${plan}&interval=${interval}`);
        return;
      }
      setMessage(explainError(e));
      setBusy(null);
    }
  };

  return (
    <div className={className}>
      <div className="flex items-center justify-center gap-3">
        <span className={`text-sm ${interval === "month" ? "text-ink" : "text-ink-3"}`}>Monthly</span>
        <button
          type="button"
          role="switch"
          aria-checked={interval === "year"}
          aria-label="Bill yearly"
          onClick={() => setInterval(interval === "month" ? "year" : "month")}
          className="relative h-7 w-12 rounded-full border border-ink bg-paper-2 transition-colors aria-checked:bg-ink"
        >
          <span
            className={`absolute top-0.5 h-5.5 w-5.5 rounded-full bg-accent transition-[left] duration-200 ${
              interval === "year" ? "left-[calc(100%-1.5rem)]" : "left-0.5"
            }`}
          />
        </button>
        <span className={`text-sm ${interval === "year" ? "text-ink" : "text-ink-3"}`}>
          Yearly <span className="mono ml-1 rounded-[3px] bg-accent px-1.5 py-0.5 text-[11px] text-accent-ink">save up to 25%</span>
        </span>
      </div>

      {message && (
        <p role="alert" className="mx-auto mt-6 max-w-md rounded-[4px] border border-bad/40 bg-bad/5 px-3 py-2 text-center text-sm text-bad">
          {message}
        </p>
      )}

      <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {PLAN_ORDER.map((id, i) => (
          <PlanCard key={id} plan={PLANS[id]} interval={interval} busy={busy === id} onBuy={() => buy(id)} index={i} />
        ))}
      </div>

      <CompareTable className="mt-16" />
    </div>
  );
}

function PlanCard({ plan, interval, busy, onBuy, index }: { plan: Plan; interval: BillingInterval; busy: boolean; onBuy: () => void; index: number }) {
  const hi = !!plan.highlight;
  const price = interval === "year" ? plan.priceYearlyPerMonth : plan.priceMonthly;
  const free = plan.id === "free";
  return (
    <div
      className={`reveal relative flex flex-col rounded-[6px] p-6 ${
        hi ? "bg-ink text-paper shadow-lift" : "border border-line bg-paper-2 text-ink"
      }`}
      style={{ ["--d" as string]: `${index * 80}ms` }}
    >
      {hi && (
        <span className="mono absolute -top-3 left-6 rounded-[3px] bg-accent px-2 py-1 text-[11px] uppercase tracking-widest text-accent-ink">
          most popular
        </span>
      )}
      <h3 className="display text-2xl font-semibold">{plan.name}</h3>
      <p className={`mt-1 text-sm ${hi ? "text-paper/70" : "text-ink-2"}`}>{plan.tagline}</p>
      <p className="display mt-6 flex items-baseline gap-1 text-5xl font-semibold tracking-tight">
        <span className="text-2xl">$</span>
        {free ? "0" : price.toFixed(2)}
        {!free && <span className={`mono text-sm font-normal ${hi ? "text-paper/60" : "text-ink-3"}`}>/mo</span>}
      </p>
      <p className={`mono mt-1 h-5 text-xs ${hi ? "text-paper/60" : "text-ink-3"}`}>
        {free ? "no card needed" : interval === "year" ? `$${yearlyTotal(plan).toFixed(2)} billed yearly · save ${yearlySavingsPct(plan)}%` : "billed monthly · cancel anytime"}
      </p>
      <ul className="mt-6 flex-1 space-y-2 text-sm">
        {plan.features.map((f) => (
          <li key={f} className="flex gap-2">
            <span className={`mono ${hi ? "text-accent" : "text-ink"}`} aria-hidden="true">
              →
            </span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      {free ? (
        <Link
          href="/"
          className={`mt-8 inline-flex items-center justify-center rounded-[4px] border px-4 py-3 text-sm font-medium transition-colors ${
            hi ? "border-paper text-paper" : "border-ink text-ink hover:bg-ink hover:text-paper"
          }`}
        >
          Start converting
        </Link>
      ) : (
        <button
          type="button"
          onClick={onBuy}
          disabled={busy}
          className={`mt-8 inline-flex items-center justify-center rounded-[4px] px-4 py-3 text-sm font-medium transition-transform enabled:hover:-translate-y-0.5 disabled:opacity-60 ${
            hi ? "bg-accent text-accent-ink" : "bg-ink text-paper"
          }`}
        >
          {busy ? "Opening checkout…" : `Get ${plan.name}`}
        </button>
      )}
    </div>
  );
}

function CompareTable({ className = "" }: { className?: string }) {
  const rows: Array<{ label: string; get: (p: Plan) => string }> = [
    { label: "Conversions", get: (p) => (p.id === "free" ? "10 total" : "Unlimited") },
    { label: "Max file size", get: (p) => formatBytes(p.maxFileBytes) },
    { label: "At the same time", get: (p) => String(p.concurrentJobs) },
    { label: "Batch upload", get: (p) => (p.batchSize === 1 ? "—" : `${p.batchSize} files`) },
    { label: "Downloads kept", get: (p) => formatRetention(p.retentionHours) },
    { label: "Queue priority", get: (p) => ["Standard", "Standard+", "Priority", "Top"][p.priority] ?? "Standard" },
    { label: "API calls / month", get: (p) => (p.apiCallsPerMonth ? p.apiCallsPerMonth.toLocaleString() : "—") },
    { label: "Team seats", get: (p) => String(p.seats) },
    { label: "Ads", get: () => "None" },
  ];
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-ink">
            <th scope="col" className="py-3 text-left font-normal text-ink-3">
              Compare
            </th>
            {PLAN_ORDER.map((id) => (
              <th key={id} scope="col" className="display py-3 text-left text-lg font-semibold">
                {PLANS[id].name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row" className="py-3 text-left font-normal text-ink-2">
                {r.label}
              </th>
              {PLAN_ORDER.map((id) => (
                <td key={id} className="mono py-3 text-ink">
                  {r.get(PLANS[id])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
