import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CATEGORY_LABELS, POPULAR_PAIRS, pairSlug, parsePairSlug, sourcesFor, targetsFor } from "@anyform/shared";
import { Converter } from "@/components/Converter";
import { Faq } from "@/components/Faq";
import { FormatChip } from "@/components/FormatChip";
import { PairArrow } from "@/components/PairArrow";
import { Reveal } from "@/components/Reveal";
import { pairCopy } from "@/lib/copy";
import { SITE_NAME, SITE_URL } from "@/lib/site";

type Params = { pair: string };

export const dynamicParams = true;

export function generateStaticParams(): Params[] {
  return POPULAR_PAIRS.map(([a, b]) => ({ pair: pairSlug(a, b) }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { pair } = await params;
  const p = parsePairSlug(pair);
  if (!p) return { title: "Not found" };
  const c = pairCopy(p.from, p.to);
  return {
    title: c.title,
    description: c.description,
    alternates: { canonical: `${SITE_URL}/convert/${pairSlug(p.from, p.to)}` },
    openGraph: { title: `${c.title} · ${SITE_NAME}`, description: c.description, url: `${SITE_URL}/convert/${pair}` },
  };
}

export default async function PairPage({ params }: { params: Promise<Params> }) {
  const { pair } = await params;
  const p = parsePairSlug(pair);
  if (!p) notFound();
  const { from, to } = p;
  const copy = pairCopy(from, to);

  const otherTargets = targetsFor(from).filter((t) => t.ext !== to.ext).slice(0, 12);
  const otherSources = sourcesFor(to).filter((s) => s.ext !== from.ext).slice(0, 12);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: `How to convert ${from.ext.toUpperCase()} to ${to.ext.toUpperCase()}`,
    description: copy.description,
    totalTime: "PT1M",
    estimatedCost: { "@type": "MonetaryAmount", currency: "USD", value: "0" },
    tool: [{ "@type": "HowToTool", name: SITE_NAME }],
    step: copy.steps.map((text, i) => ({ "@type": "HowToStep", position: i + 1, text })),
  };

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: copy.faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />

      <section className="relative overflow-hidden">
        <div className="hairline-grid pointer-events-none absolute inset-0 opacity-70" aria-hidden="true" />
        <div className="relative mx-auto max-w-6xl px-4 pb-12 pt-10 sm:px-6 lg:pt-16">
          <Reveal>
            <nav aria-label="Breadcrumb" className="mono text-xs text-ink-3">
              <Link href="/" className="hover:text-ink">
                anyform
              </Link>{" "}
              / <Link href="/formats" className="hover:text-ink">formats</Link> / {CATEGORY_LABELS[from.category].toLowerCase()}
            </nav>
          </Reveal>
          <Reveal delay={60}>
            <div className="mt-5 flex flex-wrap items-center gap-3 sm:gap-5">
              <FormatChip format={from} size="xl" tone="paper" />
              <PairArrow size={44} />
              <FormatChip format={to} size="xl" />
            </div>
          </Reveal>
          <Reveal delay={120}>
            <h1 className="display mt-6 text-[clamp(2.25rem,6vw,4.5rem)] font-semibold leading-[0.98] tracking-[-0.03em]">
              Convert {from.ext.toUpperCase()} to {to.ext.toUpperCase()}
              <span className="text-ink-3"> online, free.</span>
            </h1>
          </Reveal>
          <Reveal delay={180}>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-2">{copy.intro}</p>
          </Reveal>
          <Reveal delay={240} className="mt-10">
            <Converter initialFrom={from.ext} initialTo={to.ext} />
          </Reveal>
        </div>
      </section>

      <section className="mx-auto mt-16 grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-[1.2fr_1fr]">
        <article>
          <h2 className="display text-3xl font-semibold">
            Why convert {from.name} to {to.name}?
          </h2>
          <p className="mt-4 text-base leading-relaxed text-ink-2">{copy.why}</p>

          <h2 className="display mt-10 text-2xl font-semibold">What to expect</h2>
          <ul className="mt-4 space-y-3">
            {copy.quality.map((q) => (
              <li key={q} className="flex gap-3 text-sm leading-relaxed text-ink-2">
                <span className="mono mt-0.5 text-ink" aria-hidden="true">
                  →
                </span>
                {q}
              </li>
            ))}
          </ul>

          <h2 className="display mt-10 text-2xl font-semibold">
            How to convert .{from.ext} to .{to.ext}
          </h2>
          <ol className="mt-4 space-y-3">
            {copy.steps.map((s, i) => (
              <li key={s} className="flex gap-4 text-sm leading-relaxed text-ink-2">
                <span className="mono shrink-0 text-ink">0{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
        </article>

        <aside className="space-y-10">
          <div>
            <h2 className="mono text-xs uppercase tracking-widest text-ink-3">
              .{from.ext} to other formats
            </h2>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {otherTargets.map((t) => (
                <li key={t.ext}>
                  <Link href={`/convert/${pairSlug(from, t)}`} className="mono inline-block rounded-[3px] border border-line bg-paper-2 px-2.5 py-1.5 text-sm text-ink hover:border-ink">
                    {from.ext} → {t.ext}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="mono text-xs uppercase tracking-widest text-ink-3">
              other formats to .{to.ext}
            </h2>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {otherSources.map((s) => (
                <li key={s.ext}>
                  <Link href={`/convert/${pairSlug(s, to)}`} className="mono inline-block rounded-[3px] border border-line bg-paper-2 px-2.5 py-1.5 text-sm text-ink hover:border-ink">
                    {s.ext} → {to.ext}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-[6px] border border-line bg-paper-2 p-5">
            <p className="display text-xl font-semibold">Need bigger files?</p>
            <p className="mt-1 text-sm text-ink-2">Free covers 100 MB. Paid plans go to 5 GB, unlimited conversions, no queue.</p>
            <Link href="/pricing" className="link-ink mt-3 inline-block text-sm">
              See plans
            </Link>
          </div>
        </aside>
      </section>

      <section className="mx-auto mt-16 max-w-3xl px-4 sm:px-6">
        <h2 className="display text-3xl font-semibold">Questions about {from.ext.toUpperCase()} to {to.ext.toUpperCase()}</h2>
        <Faq items={copy.faq} className="mt-6" />
      </section>
    </>
  );
}
