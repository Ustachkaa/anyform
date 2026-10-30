"use client";

import Link from "next/link";
import { FormatChip } from "@/components/FormatChip";
import { PairArrow } from "@/components/PairArrow";

/** Shown when a server component throws, e.g. the dashboard while the API is unreachable. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-8 pt-20 text-center sm:px-6">
      <div className="flex items-center justify-center gap-4">
        <FormatChip format="500" size="xl" tone="paper" />
        <PairArrow size={40} tone="muted" />
        <FormatChip format="…" size="xl" />
      </div>
      <h1 className="display mt-8 text-4xl font-semibold tracking-tight">Something on our side stalled.</h1>
      <p className="mt-3 text-ink-2">You're still signed in. Give it a moment and try again.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className="rounded-[4px] bg-ink px-5 py-3 text-sm font-medium text-paper">
          Try again
        </button>
        <Link href="/" className="rounded-[4px] border border-ink px-5 py-3 text-sm font-medium text-ink hover:bg-ink hover:text-paper">
          Back to the converter
        </Link>
      </div>
    </div>
  );
}
