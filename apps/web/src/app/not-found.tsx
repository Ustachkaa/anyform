import Link from "next/link";
import { FormatChip } from "@/components/FormatChip";
import { PairArrow } from "@/components/PairArrow";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-8 pt-20 text-center sm:px-6">
      <div className="flex items-center justify-center gap-4">
        <FormatChip format="404" size="xl" tone="paper" />
        <PairArrow size={40} tone="muted" />
        <FormatChip format="???" size="xl" />
      </div>
      <h1 className="display mt-8 text-4xl font-semibold tracking-tight">That page doesn't convert.</h1>
      <p className="mt-3 text-ink-2">Either the link is wrong or that pair of formats isn't supported yet.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/" className="rounded-[4px] bg-ink px-5 py-3 text-sm font-medium text-paper">
          Convert something
        </Link>
        <Link href="/formats" className="rounded-[4px] border border-ink px-5 py-3 text-sm font-medium text-ink hover:bg-ink hover:text-paper">
          Browse formats
        </Link>
      </div>
    </div>
  );
}
