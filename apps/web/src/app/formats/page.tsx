import type { Metadata } from "next";
import Link from "next/link";
import { CATEGORY_LABELS, CATEGORY_ORDER, allPairs, formatsByCategory, pairSlug, targetsFor } from "@anyform/shared";
import { FormatChip } from "@/components/FormatChip";
import { Reveal } from "@/components/Reveal";

export const metadata: Metadata = {
  title: "All supported formats",
  description: "Every file format Anyform can read and write, grouped by type, with the most useful conversions for each.",
};

export default function FormatsPage() {
  const byCat = formatsByCategory();
  const pairCount = allPairs().length;
  return (
    <div className="mx-auto max-w-6xl px-4 pb-8 pt-10 sm:px-6 lg:pt-16">
      <Reveal>
        <p className="mono text-xs uppercase tracking-widest text-ink-3">registry</p>
        <h1 className="display mt-2 text-[clamp(2.25rem,6vw,4.5rem)] font-semibold leading-[0.98] tracking-[-0.03em]">
          Every format we speak.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-2">
          <span className="mono">{Object.values(byCat).flat().length}</span> formats across{" "}
          <span className="mono">{CATEGORY_ORDER.length}</span> categories, <span className="mono">{pairCount}</span> conversion pairs. Pick a source
          to see where it can go.
        </p>
      </Reveal>

      <nav aria-label="Categories" className="mt-8 flex flex-wrap gap-1.5">
        {CATEGORY_ORDER.map((c) => (
          <a key={c} href={`#${c}`} className="mono rounded-[3px] border border-line bg-paper-2 px-2.5 py-1.5 text-sm text-ink hover:border-ink">
            {CATEGORY_LABELS[c].toLowerCase()} <span className="text-ink-3">{byCat[c].length}</span>
          </a>
        ))}
      </nav>

      {CATEGORY_ORDER.map((c, ci) => (
        <section key={c} id={c} className="mt-16 scroll-mt-6" aria-labelledby={`h-${c}`}>
          <div className="flex items-baseline justify-between border-b border-ink pb-3">
            <h2 id={`h-${c}`} className="display text-3xl font-semibold">
              {CATEGORY_LABELS[c]}
            </h2>
            <span className="mono text-xs text-ink-3">0{ci + 1}</span>
          </div>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {byCat[c].map((f) => {
              const targets = targetsFor(f).slice(0, 6);
              return (
                <li key={f.ext} className="flex flex-col rounded-[6px] border border-line bg-paper-2 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <FormatChip format={f} size="lg" />
                    <span className="mono text-[11px] uppercase tracking-widest text-ink-3">
                      {f.input && f.output ? "in · out" : f.input ? "input only" : "output only"}
                    </span>
                  </div>
                  <h3 className="display mt-3 text-xl font-semibold">{f.name}</h3>
                  <p className="mt-1 flex-1 text-sm leading-relaxed text-ink-2">{f.blurb}</p>
                  {targets.length > 0 && (
                    <div className="mt-4">
                      <p className="mono text-[11px] uppercase tracking-widest text-ink-3">convert to</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {targets.map((t) => (
                          <Link
                            key={t.ext}
                            href={`/convert/${pairSlug(f, t)}`}
                            className="mono rounded-[3px] border border-line bg-paper px-2 py-1 text-xs text-ink hover:border-ink"
                          >
                            .{t.ext}
                          </Link>
                        ))}
                        {targetsFor(f).length > 6 && (
                          <span className="mono px-1 py-1 text-xs text-ink-3">+{targetsFor(f).length - 6} more</span>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
