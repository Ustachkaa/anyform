import { readFile, readdir, rename, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Finding the converted file after an engine exits cleanly, and explaining
 * in plain words when there is none. Kept free of database/storage imports
 * so it can be unit-tested.
 */

export type OutputCheck = { ok: true; bytes: number } | { ok: false; reason: "missing" | "empty" };

/** Targets where an empty result means "there was no text to extract" rather than a broken file. */
const TEXT_TARGETS = new Set(["txt", "md", "csv"]);

/**
 * Locate the engine's output. Some tools, given a multi-page or multi-frame
 * source, write `output-0.jpg`, `output-1.jpg`, … instead of `output.jpg`; the
 * first numbered sibling is adopted so the user still gets a file.
 */
export async function locateOutput(outputPath: string): Promise<OutputCheck> {
  const found = await stat(outputPath).catch(() => null);
  if (found && found.size > 0) {
    if (await isBlankText(outputPath, found.size)) return { ok: false, reason: "empty" };
    return { ok: true, bytes: found.size };
  }

  const { dir, name, ext } = path.parse(outputPath);
  const numbered = new RegExp(`^${escapeRegExp(name)}-(\\d+)${escapeRegExp(ext)}$`, "i");
  const siblings = (await readdir(dir).catch(() => [] as string[]))
    .map((f) => ({ f, m: numbered.exec(f) }))
    .filter((x): x is { f: string; m: RegExpExecArray } => x.m !== null)
    .sort((a, b) => Number(a.m[1]) - Number(b.m[1]));
  for (const { f } of siblings) {
    const s = await stat(path.join(dir, f)).catch(() => null);
    if (s && s.size > 0) {
      await rename(path.join(dir, f), outputPath);
      return { ok: true, bytes: s.size };
    }
  }
  return { ok: false, reason: found ? "empty" : "missing" };
}

/**
 * What the user sees when a conversion finished without producing a usable
 * file. Kept within the web app's 160-character error display (Converter's
 * humaniseJobError cuts longer text). Failed jobs are not counted by the
 * quota (quota/usage.ts), hence the reassurance.
 */
export function noOutputMessage(fromExt: string, toExt: string, reason: "missing" | "empty"): string {
  const notCharged = "This didn't count toward your conversions.";
  if (reason === "empty" && TEXT_TARGETS.has(toExt)) {
    const scan = fromExt === "pdf" ? " Scanned PDFs have no text layer to extract." : "";
    return `We couldn't find any text in this file.${scan} ${notCharged}`;
  }
  return `This .${fromExt} couldn't become a .${toExt}: no file came out. It may be damaged or use a feature we don't support yet. ${notCharged}`;
}

/**
 * A text target holding only whitespace is empty in all but name: pdftotext
 * writes a lone form feed per page for a scanned, image-only PDF.
 */
async function isBlankText(file: string, size: number): Promise<boolean> {
  if (!TEXT_TARGETS.has(path.extname(file).slice(1).toLowerCase()) || size > 64 * 1024) return false;
  return /^[\s﻿]*$/.test(await readFile(file, "utf8"));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
