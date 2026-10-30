import { writeFile } from "node:fs/promises";
import path from "node:path";
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

/** Inputs written by hand rather than by an office suite: anything in them may point anywhere. */
export const UNTRUSTED_TEXT_INPUTS = new Set(["md", "txt", "html"]);

/**
 * Lua filter run on untrusted text inputs. --sandbox stops pandoc itself from
 * reading files, but pandoc then leaves the reference in place, and the next
 * tool does follow it: LibreOffice renders `<iframe src="file:///etc/passwd">`
 * into the PDF and fetches http images (SSRF), calibre packs linked files into
 * the book. So the document leaves pandoc with no raw HTML/TeX, no image that
 * isn't inline data, no link to anything but the web or an anchor, no style
 * or source attributes, and no metadata beyond a plain title.
 */
export const UNTRUSTED_FILTER = `
local function safe_target(t)
  return t:match("^#") or t:match("^https?://") or t:match("^mailto:")
end
local function clean(el)
  for _, k in ipairs({ "style", "src", "srcset", "href", "background", "poster", "data", "xlink:href" }) do
    el.attributes[k] = nil
  end
  return el
end
local filter = {
  RawBlock = function() return {} end,
  RawInline = function() return {} end,
  Image = function(el)
    if el.src:match("^data:image/") then return clean(el) end
    return el.caption
  end,
  Link = function(el)
    if not safe_target(el.target) then return el.content end
    return clean(el)
  end,
}
for _, t in ipairs({ "Div", "Span", "Header", "Code", "CodeBlock", "Table", "Figure" }) do
  filter[t] = clean
end
-- Metadata feeds template variables (css, header-includes, ...): keep only a plain-text title.
local meta = {
  Meta = function(m)
    return pandoc.Meta({ title = pandoc.utils.stringify(m.title or "Converted document") })
  end,
}
return { filter, meta }
`;

export function buildPandocArgs(input: string, output: string, fromExt: string, toExt: string, filterPath?: string): string[] {
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
  if (UNTRUSTED_TEXT_INPUTS.has(fromExt)) {
    if (!filterPath) throw new EngineError("pandoc", `pandoc needs the untrusted-input filter for ${fromExt}`);
    args.push("--lua-filter", filterPath);
  }
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
    let filterPath: string | undefined;
    if (UNTRUSTED_TEXT_INPUTS.has(ctx.fromExt)) {
      filterPath = path.join(ctx.tmpDir, "untrusted-input.lua");
      await writeFile(filterPath, UNTRUSTED_FILTER);
    }
    const args = buildPandocArgs(ctx.inputPath, ctx.outputPath, ctx.fromExt, ctx.toExt, filterPath);
    ctx.log(`pandoc ${args.join(" ")}`);
    ctx.onProgress(10);
    try {
      await runOk(found.path, args, { timeoutMs: ctx.timeoutMs, cwd: ctx.tmpDir });
    } catch (err) {
      throw new EngineError("pandoc", `pandoc failed: ${(err as Error).message}`);
    }
  },
};
