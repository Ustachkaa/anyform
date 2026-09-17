import type { UsageDTO } from "@anyform/shared";
import { getPlan } from "@anyform/shared";

interface Props {
  usage: UsageDTO;
  compact?: boolean;
  className?: string;
}

/** The 10-free countdown: one yellow segment per remaining conversion. */
export function UsageMeter({ usage, compact = false, className = "" }: Props) {
  const plan = getPlan(usage.plan);
  if (usage.limit === null) {
    return (
      <p className={`text-sm text-ink-2 ${className}`}>
        <span className="mono rounded-[3px] bg-ink px-1.5 py-0.5 text-xs text-paper">{plan.name}</span>{" "}
        Unlimited conversions.
      </p>
    );
  }
  const limit = usage.limit;
  const remaining = usage.remaining ?? 0;
  const segments = Array.from({ length: limit }, (_, i) => i < remaining);
  return (
    <div className={className} aria-live="polite">
      <div className="flex items-baseline justify-between gap-3">
        <p className={`${compact ? "text-sm" : "text-base"} text-ink-2`}>
          <span className="display text-ink font-semibold">{remaining}</span>
          <span className="mono text-ink-3"> / {limit}</span> free conversion{remaining === 1 ? "" : "s"} left
        </p>
        {usage.resetsAt && !compact ? (
          <p className="mono text-xs text-ink-3">resets {new Date(usage.resetsAt).toLocaleDateString()}</p>
        ) : null}
      </div>
      <div className="mt-2 grid gap-1" style={{ gridTemplateColumns: `repeat(${limit}, minmax(0, 1fr))` }} role="img" aria-label={`${remaining} of ${limit} free conversions remaining`}>
        {segments.map((on, i) => (
          <span
            key={i}
            className={`h-2 rounded-[2px] transition-colors ${on ? "bg-accent" : "bg-ink/15"}`}
          />
        ))}
      </div>
    </div>
  );
}
