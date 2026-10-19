import type { EngineInfo } from "@anyform/shared";
import { config } from "../config.js";
import { findBinary, runOk } from "./exec.js";
import { EngineError, memo, type Engine, type EngineContext } from "./types.js";

/**
 * pandoc — text-centric document formats (Markdown, HTML, DOCX, ODT, RTF,
 * plain text) and EPUB/FB2. Cannot produce PDF without LaTeX, so PDF targets
 * are chained through LibreOffice in the registry.
 */
export const pandocCandidates = (): Array<string | undefined> => [
  config.PANDOC_PATH,
  "pandoc",
  ...(process.platform === "win32" ? ["C:\\Program Files\\Pandoc\\pandoc.exe"] : []),
];

export const PANDOC_READERS: Record<string, string> = {
  md: "markdown",
  txt: "markdown_strict",
  html: "html",
  rtf: "rtf",
  docx: "docx",
  odt: "odt",
  epub: "epub",
  fb2: "fb2",
};

export const PANDOC_WRITERS: Record<string, string> = {
  md: "gfm",
  txt: "plain",
  html: "html",
  rtf: "rtf",
  docx: "docx",
  odt: "odt",
  epub: "epub3",
  fb2: "fb2",
};

export function pandocSupports(fromExt: string, toExt: string): boolean {
  return fromExt in PANDOC_READERS && toExt in PANDOC_WRITERS && fromExt !== toExt;
}

export function buildPandocArgs(input: string, output: string, fromExt: string, toExt: string): string[] {
  const reader = PANDOC_READERS[fromExt];
  const writer = PANDOC_WRITERS[toExt];
  if (!reader || !writer) throw new EngineError("pandoc", `pandoc cannot convert ${fromExt} → ${toExt}`);
  // --sandbox: pandoc may read only the input file (and its own data files).
  // Without it, `![x](file:///etc/passwd)` or a local path in Markdown/HTML was
  // embedded into the output (html/docx/odt/epub, and pdf via the html chain),
  // letting an upload exfiltrate any file the worker can read.
  const args = ["--sandbox", "-f", reader, "-t", writer, "--standalone", "--wrap=none"];
  if (toExt === "epub" || toExt === "html" || toExt === "fb2") args.push("--metadata=title:Converted document");
  if (toExt === "html") args.push("--embed-resources");
  args.push("-o", output, input);
  return args;
}

export const pandocEngine: Engine = {
  name: "pandoc",
  probe: memo(async (): Promise<EngineInfo> => {
    const found = await findBinary(pandocCandidates(), ["--version"]);
    return { name: "pandoc", available: Boolean(found), version: found?.version };
  }),
  async convert(ctx: EngineContext): Promise<void> {
    const found = await findBinary(pandocCandidates(), ["--version"]);
    if (!found) throw new EngineError("pandoc", "pandoc is not installed");
    const args = buildPandocArgs(ctx.inputPath, ctx.outputPath, ctx.fromExt, ctx.toExt);
    ctx.log(`pandoc ${args.join(" ")}`);
    ctx.onProgress(10);
    try {
      await runOk(found.path, args, { timeoutMs: ctx.timeoutMs, cwd: ctx.tmpDir });
    } catch (err) {
      throw new EngineError("pandoc", `pandoc failed: ${(err as Error).message}`);
    }
  },
};
