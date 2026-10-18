import type { EngineInfo } from "@anyform/shared";
import { config } from "../config.js";
import { findBinary, runOk } from "./exec.js";
import { EngineError, memo, type Engine, type EngineContext } from "./types.js";

/**
 * ImageMagick — the fallback for image formats libvips cannot handle
 * (BMP, ICO, HEIC input) and for image → PDF when pdf-lib cannot embed the
 * source. `magick` (v7) is preferred; on Linux distros that ship v6 we use
 * `convert`. On Windows `convert` is a system tool and is never used.
 */
export const magickCandidates = (): Array<string | undefined> => [
  config.MAGICK_PATH,
  "magick",
  ...(process.platform === "win32" ? [] : ["convert"]),
];

/**
 * Targets that hold exactly one image. Given a multi-frame source (animated
 * GIF, HEIC with several images) ImageMagick would write output-0.jpg,
 * output-1.jpg, … and never `output.jpg`, so these read only the first frame.
 */
export const SINGLE_FRAME_TARGETS = new Set(["jpg", "png", "bmp"]);

export function buildMagickArgs(input: string, output: string, fromExt: string, toExt: string, o: EngineContext["options"]): string[] {
  // Explicit input format prefix avoids ImageMagick guessing from magic bytes
  // for containers it may misdetect (heic/heif share a brand list).
  const frame = SINGLE_FRAME_TARGETS.has(toExt) ? `${input}[0]` : input;
  const inSpec = fromExt === "heic" ? `HEIC:${frame}` : frame;
  const args: string[] = [inSpec, "-auto-orient"];
  if (o.width || o.height) args.push("-resize", `${o.width ?? ""}x${o.height ?? ""}>`);
  if (toExt === "jpg") {
    args.push("-background", "white", "-alpha", "remove", "-alpha", "off", "-quality", String(o.quality ?? 88));
  } else if (toExt === "webp" || toExt === "avif") {
    args.push("-quality", String(o.quality ?? 82));
  } else if (toExt === "ico") {
    args.push("-define", "icon:auto-resize=256,128,64,48,32,16");
  } else if (toExt === "pdf") {
    args.push("-units", "PixelsPerInch", "-density", "96");
  }
  args.push(output);
  return args;
}

export const imagemagickEngine: Engine = {
  name: "imagemagick",
  probe: memo(async (): Promise<EngineInfo> => {
    const found = await findBinary(magickCandidates(), ["-version"]);
    return { name: "imagemagick", available: Boolean(found), version: found?.version };
  }),
  async convert(ctx: EngineContext): Promise<void> {
    const found = await findBinary(magickCandidates(), ["-version"]);
    if (!found) throw new EngineError("imagemagick", "ImageMagick is not installed");
    const args = buildMagickArgs(ctx.inputPath, ctx.outputPath, ctx.fromExt, ctx.toExt, ctx.options);
    ctx.log(`${found.path} ${args.join(" ")}`);
    try {
      await runOk(found.path, args, { timeoutMs: ctx.timeoutMs, cwd: ctx.tmpDir });
    } catch (err) {
      throw new EngineError("imagemagick", `ImageMagick failed: ${(err as Error).message}`);
    }
  },
};
