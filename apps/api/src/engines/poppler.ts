import { rename, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { EngineInfo } from "@anyform/shared";
import { config } from "../config.js";
import { findBinary, runOk } from "./exec.js";
import { EngineError, memo, type Engine, type EngineContext } from "./types.js";

/**
 * poppler-utils — PDF → raster image (pdftoppm) and PDF → text (pdftotext).
 * Renders one page (the first, or the first page listed in `options.pages`);
 * multi-page → ZIP is a roadmap item.
 */
export const pdftoppmCandidates = (): Array<string | undefined> => [config.PDFTOPPM_PATH, "pdftoppm"];
export const pdftotextCandidates = (): Array<string | undefined> => [config.PDFTOTEXT_PATH, "pdftotext"];

export function firstPage(pages?: string): number {
  if (!pages) return 1;
  const m = /\d+/.exec(pages);
  const n = m ? Number(m[0]) : 1;
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

export function buildPdftoppmArgs(input: string, outPrefix: string, toExt: string, o: EngineContext["options"]): string[] {
  const page = String(firstPage(o.pages));
  const dpi = o.width ? String(Math.min(600, Math.max(36, Math.round((o.width / 8.27) /* A4 inches */)))) : "150";
  const args = ["-f", page, "-l", page, "-r", dpi, "-singlefile"];
  if (toExt === "jpg") args.push("-jpeg", "-jpegopt", `quality=${o.quality ?? 88}`);
  else args.push("-png"); // png and webp (webp is re-encoded from png)
  args.push(input, outPrefix);
  return args;
}

export const popplerEngine: Engine = {
  name: "poppler",
  probe: memo(async (): Promise<EngineInfo> => {
    const found = await findBinary(pdftoppmCandidates(), ["-v"]);
    return { name: "poppler", available: Boolean(found), version: found?.version };
  }),
  async convert(ctx: EngineContext): Promise<void> {
    if (ctx.fromExt !== "pdf") throw new EngineError("poppler", "poppler only reads PDF");

    if (ctx.toExt === "txt") {
      const found = await findBinary(pdftotextCandidates(), ["-v"]);
      if (!found) throw new EngineError("poppler", "pdftotext is not installed");
      try {
        await runOk(found.path, ["-layout", "-enc", "UTF-8", ctx.inputPath, ctx.outputPath], { timeoutMs: ctx.timeoutMs, cwd: ctx.tmpDir });
      } catch (err) {
        throw new EngineError("poppler", `pdftotext failed: ${(err as Error).message}`);
      }
      return;
    }

    if (!["jpg", "png", "webp"].includes(ctx.toExt)) throw new EngineError("poppler", `poppler cannot write ${ctx.toExt}`);
    const found = await findBinary(pdftoppmCandidates(), ["-v"]);
    if (!found) throw new EngineError("poppler", "pdftoppm is not installed");

    const prefix = path.join(ctx.tmpDir, "page");
    const args = buildPdftoppmArgs(ctx.inputPath, prefix, ctx.toExt, ctx.options);
    ctx.log(`pdftoppm ${args.join(" ")}`);
    try {
      await runOk(found.path, args, { timeoutMs: ctx.timeoutMs, cwd: ctx.tmpDir });
    } catch (err) {
      throw new EngineError("poppler", `pdftoppm failed: ${(err as Error).message}`);
    }
    ctx.onProgress(70);

    const produced = `${prefix}.${ctx.toExt === "jpg" ? "jpg" : "png"}`;
    await stat(produced).catch(() => {
      throw new EngineError("poppler", "pdftoppm produced no output (empty or encrypted PDF?)");
    });

    if (ctx.toExt === "webp") {
      await sharp(produced).webp({ quality: ctx.options.quality ?? 82 }).toFile(ctx.outputPath);
    } else {
      await rename(produced, ctx.outputPath);
    }
  },
};
