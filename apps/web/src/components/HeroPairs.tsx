"use client";

import { useEffect, useState } from "react";
import { POPULAR_PAIRS } from "@anyform/shared";
import { FormatChip } from "./FormatChip";
import { PairArrow } from "./PairArrow";

const SHOWCASE: ReadonlyArray<readonly [string, string]> = [
  ["mov", "mp4"],
  ["heic", "jpg"],
  ["pdf", "docx"],
  ["mp4", "mp3"],
  ["webp", "png"],
  ["epub", "mobi"],
  ["pptx", "pdf"],
  ["wav", "flac"],
  ...POPULAR_PAIRS.slice(0, 0),
];

/** Cycles through format pairs in the hero, flipping the chips in. */
export function HeroPairs() {
  const [i, setI] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const t = setInterval(() => setI((n) => (n + 1) % SHOWCASE.length), 2200);
    return () => clearInterval(t);
  }, []);

  const pair = SHOWCASE[i] ?? SHOWCASE[0]!;
  return (
    <div className="flex items-center gap-3 sm:gap-5" aria-live="off">
      <span key={`a${i}`} className="flip-in inline-block">
        <FormatChip format={pair[0]} size="xl" tone="paper" />
      </span>
      <PairArrow size={44} />
      <span key={`b${i}`} className="flip-in inline-block [animation-delay:90ms]">
        <FormatChip format={pair[1]} size="xl" tone="ink" />
      </span>
    </div>
  );
}
