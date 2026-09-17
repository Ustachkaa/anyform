import Link from "next/link";
import { SessionNav } from "./SessionNav";
import { Wordmark } from "./Wordmark";

export function SiteHeader() {
  return (
    <header className="border-b border-line bg-paper/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Wordmark />
        <nav aria-label="Primary" className="flex items-center gap-1 sm:gap-2">
          <Link href="/formats" className="rounded-[4px] px-2.5 py-1.5 text-sm text-ink-2 transition-colors hover:bg-paper-2 hover:text-ink sm:px-3">
            Formats
          </Link>
          <Link href="/pricing" className="rounded-[4px] px-2.5 py-1.5 text-sm text-ink-2 transition-colors hover:bg-paper-2 hover:text-ink sm:px-3">
            Pricing
          </Link>
          <span className="ml-1 sm:ml-2">
            <SessionNav />
          </span>
        </nav>
      </div>
    </header>
  );
}
