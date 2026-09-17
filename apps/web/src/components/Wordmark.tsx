import Link from "next/link";

interface Props {
  className?: string;
  size?: "sm" | "lg";
}

/** "anyform" in the display face with the yellow arrow mark. */
export function Wordmark({ className = "", size = "sm" }: Props) {
  const text = size === "lg" ? "text-4xl" : "text-[22px]";
  const box = size === "lg" ? "h-9 w-9" : "h-6 w-6";
  return (
    <Link href="/" className={`group inline-flex items-center gap-2 ${className}`} aria-label="Anyform home">
      <span className={`inline-flex ${box} items-center justify-center rounded-[4px] bg-accent transition-transform duration-300 group-hover:translate-x-0.5`}>
        <svg viewBox="0 0 64 64" className="h-[70%] w-[70%]" aria-hidden="true">
          <path d="M12 32h34M34 18l14 14-14 14" fill="none" stroke="#14130F" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className={`display ${text} font-semibold leading-none tracking-tight text-ink`}>anyform</span>
    </Link>
  );
}
