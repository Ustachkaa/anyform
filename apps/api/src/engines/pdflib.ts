import { readFile, writeFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import type { EngineInfo } from "@anyform/shared";
import { SHARP_INPUTS } from "./sharp.js";
import { EngineError, type Engine, type EngineContext } from "./types.js";

/**
 * pdf-lib — image → PDF, in-process. JPEGs are embedded as-is; anything else
 * libvips can read is normalised to PNG first (which also flattens HEIC-free
 * exotic variants like 16-bit TIFF).
 */

const MAX_POINTS = 14_400; // PDF page-size ceiling
const PX_TO_PT = 72 / 96; // treat pixels as 96 dpi

export function pageSizeFor(widthPx: number, heightPx: number): [number, number] {
  let w = widthPx * PX_TO_PT;
  let h = heightPx * PX_TO_PT;
  const scale = Math.min(1, MAX_POINTS / Math.max(w, h));
  w *= scale;
  h *= scale;
  return [Math.max(1, w), Math.max(1, h)];
}

export const pdflibEngine: Engine = {
  name: "pdf-lib",
  async probe(): Promise<EngineInfo> {
    return { name: "pdf-lib", available: true };
  },
  async convert(ctx: EngineContext): Promise<void> {
    if (ctx.toExt !== "pdf" || !SHARP_INPUTS.has(ctx.fromExt)) {
      throw new EngineError("pdf-lib", `pdf-lib cannot convert ${ctx.fromExt} → ${ctx.toExt}`);
    }
    ctx.onProgress(10);
    try {
      const doc = await PDFDocument.create();
      doc.setProducer("Anyform");
      doc.setCreator("Anyform");

      const base = sharp(ctx.inputPath, { density: ctx.fromExt === "svg" ? 192 : undefined, limitInputPixels: 268_402_689 }).rotate();
      if (ctx.options.width || ctx.options.height) {
        base.resize({ width: ctx.options.width, height: ctx.options.height, fit: "inside", withoutEnlargement: true });
      }

      let image;
      if (ctx.fromExt === "jpg" && !ctx.options.width && !ctx.options.height) {
        image = await doc.embedJpg(await readFile(ctx.inputPath));
      } else {
        const png = await base.png().toBuffer();
        image = await doc.embedPng(png);
      }
      ctx.onProgress(60);

      const [w, h] = pageSizeFor(image.width, image.height);
      const page = doc.addPage([w, h]);
      page.drawImage(image, { x: 0, y: 0, width: w, height: h });
      const bytes = await doc.save({ useObjectStreams: true });
      await writeFile(ctx.outputPath, bytes);
    } catch (err) {
      if (err instanceof EngineError) throw err;
      throw new EngineError("pdf-lib", `Image → PDF failed: ${(err as Error).message}`);
    }
  },
};
