import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { formatBytes, formatRetention, getPlan, isPaidPlan } from "@anyform/shared";
import { AccountActions } from "@/components/AccountActions";
import { JobHistory } from "@/components/JobHistory";
import { UsageMeter } from "@/components/UsageMeter";
import { getServerUsage, getSessionUser } from "@/lib/session";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const { checkout } = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/dashboard");
  const usage = await getServerUsage();
  const plan = getPlan(user.plan);
  const paid = isPaidPlan(plan.id);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-8 pt-10 sm:px-6 lg:pt-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mono text-xs uppercase tracking-widest text-ink-3">dashboard</p>
          <h1 className="display mt-2 text-4xl font-semibold tracking-tight">{user.name ? `Hi, ${user.name}.` : "Your files."}</h1>
          <p className="mono mt-1 text-sm text-ink-3">{user.email}</p>
        </div>
        <AccountActions paid={paid} />
      </div>

      {checkout === "success" && (
        <p role="status" className="mt-6 rounded-[4px] border border-line bg-accent/20 px-4 py-3 text-sm text-ink">
          Payment received, thank you. It can take a few seconds to show up here; refresh if it hasn't yet. Your receipt comes from Paddle.
        </p>
      )}

      <div className="mt-8 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-[6px] border border-line bg-paper-2 p-6" aria-labelledby="usage">
          <h2 id="usage" className="mono text-xs uppercase tracking-widest text-ink-3">
            usage
          </h2>
          {usage ? (
            <UsageMeter usage={usage} className="mt-3" />
          ) : (
            <p className="mt-3 text-sm text-ink-2">Usage is unavailable right now.</p>
          )}
          {!paid && (
            <p className="mt-4 text-sm text-ink-2">
              Need more?{" "}
              <Link href="/pricing" className="link-ink">
                Plans start at $7.99/mo
              </Link>{" "}
              for unlimited conversions, or{" "}
              <Link href="/pricing#pay-once" className="link-ink">
                pay once
              </Link>
              .
            </p>
          )}
        </section>

        <section className={`rounded-[6px] p-6 ${paid ? "bg-ink text-paper" : "border border-line bg-paper-2"}`} aria-labelledby="plan">
          <h2 id="plan" className={`mono text-xs uppercase tracking-widest ${paid ? "text-paper/60" : "text-ink-3"}`}>
            plan
          </h2>
          <p className="display mt-2 text-3xl font-semibold">{plan.name}</p>
          <dl className={`mono mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs ${paid ? "text-paper/80" : "text-ink-2"}`}>
            <dt>max file</dt>
            <dd className="text-right">{formatBytes(plan.maxFileBytes)}</dd>
            <dt>at once</dt>
            <dd className="text-right">{plan.concurrentJobs}</dd>
            <dt>kept for</dt>
            <dd className="text-right">{formatRetention(plan.retentionHours)}</dd>
            {user.subscription && (
              <>
                <dt>{user.subscription.cancelAtPeriodEnd ? "ends" : "renews"}</dt>
                <dd className="text-right">{new Date(user.subscription.currentPeriodEnd).toLocaleDateString()}</dd>
              </>
            )}
          </dl>
          {!paid && (
            <Link href="/pricing" className="mt-5 inline-flex rounded-[4px] bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:-translate-y-0.5">
              Upgrade
            </Link>
          )}
        </section>
      </div>

      <section className="mt-12" aria-labelledby="history">
        <div className="flex items-end justify-between border-b border-ink pb-3">
          <h2 id="history" className="display text-3xl font-semibold">
            History
          </h2>
          <Link href="/" className="link-ink text-sm">
            new conversion
          </Link>
        </div>
        <JobHistory className="mt-4" />
      </section>
    </div>
  );
}
