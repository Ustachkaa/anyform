import Link from "next/link";
import { PLANS, PLAN_ORDER, POPULAR_PAIRS, formatBytes, getFormat, pairSlug } from "@anyform/shared";
import { Converter } from "@/components/Converter";
import { Faq } from "@/components/Faq";
import { FormatChip } from "@/components/FormatChip";
import { HeroPairs } from "@/components/HeroPairs";
import { PairArrow } from "@/components/PairArrow";
import { Reveal } from "@/components/Reveal";

const FAQ = [
  {
    q: "Is Anyform really free?",
    a: "Every visitor gets 10 free conversions of files up to 100 MB, with no account and no ads. After that, plans start at $7.99 a month for unlimited conversions and bigger files.",
  },
  {
    q: "Why 10 conversions rather than a daily limit?",
    a: "Because it's a limit you can hold in your head. No minutes, no credits, no per-day reset to remember. Ten is enough to solve the problem you came here with, and enough to know whether Anyform is worth paying for.",
  },
  {
    q: "What happens to my files?",
    a: "They're sent over TLS, stored encrypted, processed on an isolated worker, and deleted automatically: after 2 hours on Free, longer on paid plans. You can also delete them instantly from the dashboard. Nobody looks at them and they're never used for anything else.",
  },
  {
    q: "Do you download videos from YouTube or other sites?",
    a: "No. Anyform converts files you already have. Downloading from streaming platforms is against their terms and usually against copyright, so we don't do it.",
  },
  {
    q: "Which engines do the conversion?",
    a: "The same open-source tools professionals use: ffmpeg for video and audio, libvips for images, LibreOffice for office documents, pandoc for text formats, calibre for ebooks and poppler for PDFs. Every finished job tells you which one did the work.",
  },
  {
    q: "Is there an API?",
    a: "Yes, on Pro and Business. The same conversions, driven by a REST call and a webhook when the file is ready.",
  },
];

export default function HomePage() {
  return (
    <>
      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="hairline-grid pointer-events-none absolute inset-0 -z-0 opacity-70" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:gap-14 lg:pt-20">
          <div>
            <Reveal>
              <p className="mono inline-flex items-center gap-2 rounded-[3px] border border-line bg-paper-2 px-2.5 py-1 text-xs text-ink-2">
                <span className="inline-block h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
                10 free conversions · no ads · files deleted in 2h
              </p>
            </Reveal>
            <Reveal delay={80}>
              <h1 className="display mt-6 text-[clamp(2.75rem,8vw,5.5rem)] font-semibold leading-[0.95] tracking-[-0.03em]">
                Any file.
                <br />
                Any format.
              </h1>
            </Reveal>
            <Reveal delay={160} className="mt-8">
              <HeroPairs />
            </Reveal>
            <Reveal delay={240}>
              <p className="mt-8 max-w-md text-lg leading-relaxed text-ink-2">
                Drop a video, photo, document, spreadsheet, deck or ebook. Pick what you need it to be. Download it seconds later.
                Fifty formats, two hundred pairs, one honest limit.
              </p>
            </Reveal>
            <Reveal delay={320}>
              <p className="mono mt-6 text-xs text-ink-3">
                video · audio · image · document · spreadsheet · presentation · ebook
              </p>
            </Reveal>
          </div>
          <Reveal delay={200} className="lg:pt-4">
            <Converter />
          </Reveal>
        </div>
      </section>

      {/* ── Popular pairs ────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6" aria-labelledby="popular">
        <div className="flex items-end justify-between gap-4 border-b border-ink pb-3">
          <h2 id="popular" className="display text-3xl font-semibold sm:text-4xl">
            Popular conversions
          </h2>
          <Link href="/formats" className="link-ink text-sm">
            all formats
          </Link>
        </div>
        <ul className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {POPULAR_PAIRS.map(([a, b], i) => (
            <li key={`${a}${b}`}>
              <Link
                href={`/convert/${pairSlug(a, b)}`}
                className="group flex items-center justify-between gap-2 rounded-[4px] border border-line bg-paper-2 px-3 py-2.5 transition-colors hover:border-ink"
                style={{ ["--d" as string]: `${Math.min(i, 12) * 30}ms` }}
              >
                <span className="mono text-sm text-ink">
                  {a} <span className="text-ink-3 transition-colors group-hover:text-ink">→</span> {b}
                </span>
                <span className="h-1.5 w-1.5 rounded-full bg-line transition-colors group-hover:bg-accent" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <section className="mx-auto mt-24 max-w-6xl px-4 sm:px-6" aria-labelledby="how">
        <h2 id="how" className="display text-3xl font-semibold sm:text-4xl">
          How it works
        </h2>
        <ol className="mt-8 grid gap-6 md:grid-cols-3">
          {[
            { n: "01", t: "Drop", d: "Drag a file in or pick one. We read the extension and show you every format it can become." },
            { n: "02", t: "Pick", d: "Choose a target. Popular ones are marked. Press Convert; upload and conversion progress are live." },
            { n: "03", t: "Download", d: "Grab the result. We tell you which engine did it, how long it took and how big it is. Then we delete it." },
          ].map((s, i) => (
            <li key={s.n} className="relative rounded-[6px] border border-line bg-paper-2 p-6" style={{ ["--d" as string]: `${i * 90}ms` }}>
              <span className="mono text-xs text-ink-3">{s.n}</span>
              <h3 className="display mt-2 text-2xl font-semibold">{s.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">{s.d}</p>
              {i < 2 && <PairArrow size={22} tone="accent" className="absolute -right-4 top-1/2 hidden -translate-y-1/2 md:block" />}
            </li>
          ))}
        </ol>
      </section>

      {/* ── Trust strip ──────────────────────────────────────────────── */}
      <section className="mt-24 border-y border-ink bg-ink text-paper" aria-label="Why Anyform">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-3">
          {[
            { t: "No ads. Ever.", d: "Not on Free, not anywhere. The free tier is how you try Anyform, not an ad inventory." },
            { t: "Deleted on schedule.", d: "Files are encrypted at rest and removed after the plan's window, or the moment you press Delete." },
            { t: "Nothing hidden.", d: "Every job says which engine ran it. ffmpeg, LibreOffice, calibre: the tools professionals use, run for you." },
          ].map((x) => (
            <div key={x.t}>
              <h3 className="display text-2xl font-semibold">
                <span className="mr-2 inline-block h-3 w-3 rounded-[2px] bg-accent align-middle" aria-hidden="true" />
                {x.t}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-paper/75">{x.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing teaser ───────────────────────────────────────────── */}
      <section className="mx-auto mt-24 max-w-6xl px-4 sm:px-6" aria-labelledby="plans">
        <div className="flex items-end justify-between gap-4 border-b border-ink pb-3">
          <h2 id="plans" className="display text-3xl font-semibold sm:text-4xl">
            Plans
          </h2>
          <Link href="/pricing" className="link-ink text-sm">
            compare everything
          </Link>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PLAN_ORDER.map((id) => {
            const p = PLANS[id];
            const hi = !!p.highlight;
            return (
              <Link
                key={id}
                href="/pricing"
                className={`rounded-[6px] p-5 transition-transform hover:-translate-y-0.5 ${hi ? "bg-ink text-paper" : "border border-line bg-paper-2"}`}
              >
                <p className="display text-xl font-semibold">{p.name}</p>
                <p className="display mt-3 text-4xl font-semibold">
                  ${p.priceMonthly === 0 ? "0" : p.priceMonthly}
                  {p.priceMonthly > 0 && <span className={`mono text-xs font-normal ${hi ? "text-paper/60" : "text-ink-3"}`}>/mo</span>}
                </p>
                <p className={`mono mt-2 text-xs ${hi ? "text-paper/70" : "text-ink-2"}`}>
                  {id === "free" ? "10 conversions" : "unlimited"} · {formatBytes(p.maxFileBytes)}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────────── */}
      <section className="mx-auto mt-24 max-w-3xl px-4 sm:px-6" aria-labelledby="faq">
        <h2 id="faq" className="display text-3xl font-semibold sm:text-4xl">
          Questions
        </h2>
        <Faq items={FAQ} className="mt-6" />
        <p className="mt-8 flex flex-wrap items-center gap-3 text-sm text-ink-2">
          Try one now:
          {[
            ["mov", "mp4"],
            ["heic", "jpg"],
            ["pdf", "docx"],
          ].map(([a, b]) => (
            <Link key={a} href={`/convert/${pairSlug(a!, b!)}`} className="inline-flex items-center gap-1.5">
              <FormatChip format={getFormat(a)!} size="sm" tone="paper" />
              <PairArrow size={12} tone="muted" />
              <FormatChip format={getFormat(b)!} size="sm" />
            </Link>
          ))}
        </p>
      </section>
    </>
  );
}
