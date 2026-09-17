import Link from "next/link";
import { POPULAR_PAIRS, PLANS, formatRetention, pairSlug } from "@anyform/shared";
import { Wordmark } from "./Wordmark";

export function SiteFooter() {
  const year = new Date().getFullYear();
  const quick = POPULAR_PAIRS.slice(0, 12);
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Wordmark />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-2">
            Any file. Any format. No nonsense. Files auto-delete after{" "}
            <span className="mono">{formatRetention(PLANS.free.retentionHours)}</span> on Free. No ads on any plan, ever.
          </p>
          <p className="mt-6 text-xs text-ink-3">© {year} Anyform. All rights reserved.</p>
        </div>
        <div>
          <h3 className="mono text-xs uppercase tracking-widest text-ink-3">Popular</h3>
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            {quick.map(([a, b]) => (
              <li key={`${a}${b}`}>
                <Link href={`/convert/${pairSlug(a, b)}`} className="mono text-ink-2 hover:text-ink">
                  {a} → {b}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mono text-xs uppercase tracking-widest text-ink-3">Anyform</h3>
          <ul className="mt-3 space-y-1.5 text-sm text-ink-2">
            <li><Link href="/formats" className="hover:text-ink">All formats</Link></li>
            <li><Link href="/pricing" className="hover:text-ink">Pricing</Link></li>
            <li><Link href="/dashboard" className="hover:text-ink">Dashboard</Link></li>
            <li><Link href="/legal/terms" className="hover:text-ink">Terms</Link></li>
            <li><Link href="/legal/privacy" className="hover:text-ink">Privacy</Link></li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
