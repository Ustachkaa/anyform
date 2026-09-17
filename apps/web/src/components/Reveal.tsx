import type { CSSProperties, ElementType, ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Delay in ms; stagger siblings with 60–120 ms steps. */
  delay?: number;
  as?: ElementType;
  className?: string;
}

/** Wraps content in a staggered page-load reveal. Pure CSS, no client JS. */
export function Reveal({ children, delay = 0, as: Tag = "div", className = "" }: Props) {
  const style = { "--d": `${delay}ms` } as CSSProperties;
  return (
    <Tag className={`reveal ${className}`} style={style}>
      {children}
    </Tag>
  );
}
