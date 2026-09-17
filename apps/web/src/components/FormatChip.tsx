import type { FormatDef } from "@anyform/shared";

type Size = "sm" | "md" | "lg" | "xl";

const sizes: Record<Size, string> = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-2.5 py-1 text-sm",
  lg: "px-3.5 py-1.5 text-lg",
  xl: "px-5 py-2 text-3xl sm:text-5xl",
};

interface Props {
  format: FormatDef | string;
  size?: Size;
  tone?: "ink" | "paper" | "accent" | "outline";
  className?: string;
}

/** A file extension set in mono on a solid chip. The brand's most repeated glyph. */
export function FormatChip({ format, size = "md", tone = "ink", className = "" }: Props) {
  const ext = typeof format === "string" ? format : format.ext;
  const tones: Record<NonNullable<Props["tone"]>, string> = {
    ink: "bg-ink text-paper",
    paper: "bg-paper-2 text-ink border border-line",
    accent: "bg-accent text-accent-ink",
    outline: "bg-transparent text-ink border border-ink",
  };
  return (
    <span
      className={`mono inline-flex items-center rounded-[3px] font-medium leading-none tracking-tight ${sizes[size]} ${tones[tone]} ${className}`}
    >
      .{ext}
    </span>
  );
}
