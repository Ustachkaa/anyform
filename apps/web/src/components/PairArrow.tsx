interface Props {
  className?: string;
  /** Pixel size of the arrow glyph box. */
  size?: number;
  tone?: "ink" | "accent" | "muted";
  title?: string;
}

/** The oversized → motif that sits between two format chips. */
export function PairArrow({ className = "", size = 28, tone = "ink", title }: Props) {
  const color = tone === "accent" ? "var(--color-accent)" : tone === "muted" ? "var(--color-ink-3)" : "var(--color-ink)";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      className={`shrink-0 ${className}`}
    >
      {title ? <title>{title}</title> : null}
      <path
        d="M8 32h44M36 16l16 16-16 16"
        fill="none"
        stroke={color}
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
