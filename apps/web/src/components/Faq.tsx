export interface FaqItem {
  q: string;
  a: string;
}

interface Props {
  items: FaqItem[];
  className?: string;
}

/** Native <details> accordion: accessible, keyboard-friendly, zero JS. */
export function Faq({ items, className = "" }: Props) {
  return (
    <div className={`divide-y divide-line border-y border-line ${className}`}>
      {items.map((it, i) => (
        <details key={i} className="group py-4 open:pb-5">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-left text-base font-medium text-ink marker:content-none [&::-webkit-details-marker]:hidden">
            <span>{it.q}</span>
            <span
              aria-hidden="true"
              className="mono mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[3px] border border-line text-sm text-ink-3 transition-transform duration-200 group-open:rotate-45 group-open:bg-accent group-open:text-accent-ink"
            >
              +
            </span>
          </summary>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-2">{it.a}</p>
        </details>
      ))}
    </div>
  );
}
