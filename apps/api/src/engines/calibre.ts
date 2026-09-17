import type { EngineInfo } from "@anyform/shared";
import { config } from "../config.js";
import { findBinary, runOk } from "./exec.js";
import { EngineError, memo, type Engine, type EngineContext } from "./types.js";

/** calibre `ebook-convert` — every ebook pair plus documents → ebooks and ebooks → pdf/docx/txt. */
export const calibreCandidates = (): Array<string | undefined> => [
  config.CALIBRE_PATH,
  "ebook-convert",
  ...(process.platform === "win32"
    ? ["C:\\Program Files\\Calibre2\\ebook-convert.exe", "C:\\Program Files (x86)\\Calibre2\\ebook-convert.exe"]
    : ["/usr/bin/ebook-convert", "/Applications/calibre.app/Contents/MacOS/ebook-convert"]),
];

export const CALIBRE_INPUTS = new Set(["epub", "mobi", "azw3", "fb2", "docx", "odt", "rtf", "txt", "html", "pdf", "md"]);
export const CALIBRE_OUTPUTS = new Set(["epub", "mobi", "azw3", "fb2", "pdf", "docx", "txt", "rtf"]);

export function calibreSupports(fromExt: string, toExt: string): boolean {
  return CALIBRE_INPUTS.has(fromExt) && CALIBRE_OUTPUTS.has(toExt) && fromExt !== toExt;
}

export function buildCalibreArgs(input: string, output: string, fromExt: string, toExt: string): string[] {
  const args = [input, output];
  if (fromExt === "md" || fromExt === "txt") args.push("--formatting-type", fromExt === "md" ? "markdown" : "auto");
  if (toExt === "pdf") args.push("--paper-size", "a4", "--pdf-page-numbers");
  if (toExt === "mobi") args.push("--mobi-file-type", "both");
  return args;
}

export const calibreEngine: Engine = {
  name: "calibre",
  probe: memo(async (): Promise<EngineInfo> => {
    const found = await findBinary(calibreCandidates(), ["--version"]);
    return { name: "calibre", available: Boolean(found), version: found?.version };
  }),
  async convert(ctx: EngineContext): Promise<void> {
    const found = await findBinary(calibreCandidates(), ["--version"]);
    if (!found) throw new EngineError("calibre", "calibre (ebook-convert) is not installed");
    // calibre reads markdown as .txt with markdown formatting
    let input = ctx.inputPath;
    if (ctx.fromExt === "md") {
      const { copyFile } = await import("node:fs/promises");
      input = `${ctx.inputPath}.txt`;
      await copyFile(ctx.inputPath, input);
    }
    const args = buildCalibreArgs(input, ctx.outputPath, ctx.fromExt, ctx.toExt);
    ctx.log(`ebook-convert ${args.join(" ")}`);
    ctx.onProgress(10);
    try {
      await runOk(found.path, args, { timeoutMs: ctx.timeoutMs, cwd: ctx.tmpDir });
    } catch (err) {
      throw new EngineError("calibre", `calibre failed: ${(err as Error).message}`);
    }
  },
};
