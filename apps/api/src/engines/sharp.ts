import sharp from "sharp";
import type { EngineInfo } from "@anyform/shared";
import { EngineError, type Engine, type EngineContext } from "./types.js";

/** Raster formats libvips (prebuilt sharp) can read and write. */
export const SHARP_INPUTS = new Set(["jpg", "png", "webp", "gif", "avif", "tiff", "svg"]);
export const SHARP_OUTPUTS = new Set(["jpg", "png", "webp", "gif", "avif", "tiff"]);

export function sharpSupports(fromExt: string, toExt: string): boolean {
  return SHARP_INPUTS.has(fromExt) && SHARP_OUTPUTS.has(toExt);
}

/** Build the sharp pipeline for an image → image conversion (exported for tests). */
export function buildSharpPipeline(input: string | Buffer, fromExt: string, toExt: string, o: EngineContext["options"]): sharp.Sharp {
  const animated = (fromExt === "gif" || fromExt === "webp") && (toExt === "gif" || toExt === "webp");
  let img = sharp(input, {
    animated,
    density: fromExt === "svg" ? 192 : undefined,
    limitInputPixels: 268_402_689, // 16384²
  }).rotate(); // honour EXIF orientation

  if (o.width || o.height) {
    img = img.resize({ width: o.width, height: o.height, fit: "inside", withoutEnlargement: true });
  }
  if (toExt === "jpg") img = img.flatten({ background: "#ffffff" });

  const q = o.quality;
  switch (toExt) {
    case "jpg":
      return img.jpeg({ quality: q ?? 85, mozjpeg: true });
    case "png":
      return img.png({ compressionLevel: 9, palette: q !== undefined && q < 50 });
    case "webp":
      return img.webp({ quality: q ?? 82 });
    case "avif":
      return img.avif({ quality: q ?? 60 });
    case "tiff":
      return img.tiff({ quality: q ?? 85, compression: "jpeg" });
    case "gif":
      return img.gif();
    default:
      throw new EngineError("sharp", `sharp cannot write ${toExt}`);
  }
}

export const sharpEngine: Engine = {
  name: "sharp",
  async probe(): Promise<EngineInfo> {
    return { name: "sharp", available: true, version: sharp.versions.vips };
  },
  async convert(ctx: EngineContext): Promise<void> {
    if (!sharpSupports(ctx.fromExt, ctx.toExt)) throw new EngineError("sharp", `sharp cannot convert ${ctx.fromExt} → ${ctx.toExt}`);
    ctx.onProgress(10);
    try {
      await buildSharpPipeline(ctx.inputPath, ctx.fromExt, ctx.toExt, ctx.options).toFile(ctx.outputPath);
    } catch (err) {
      throw new EngineError("sharp", `Image conversion failed: ${(err as Error).message}`);
    }
  },
};
