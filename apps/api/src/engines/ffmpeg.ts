import { createRequire } from "node:module";
import type { ConversionOptions, EngineInfo } from "@anyform/shared";
import { getFormat } from "@anyform/shared";
import { config } from "../config.js";
import { findBinary, run } from "./exec.js";
import { EngineError, memo, type Engine, type EngineContext } from "./types.js";

/**
 * ffmpeg — every video and audio pair, plus video ↔ gif.
 *
 * Uses the binary bundled by `ffmpeg-static` unless FFMPEG_PATH is set, so
 * video/audio conversions work on a bare development machine.
 */

function bundledFfmpegPath(): string | undefined {
  try {
    const req = createRequire(import.meta.url);
    const p = req("ffmpeg-static") as string | null;
    return p ?? undefined;
  } catch {
    return undefined;
  }
}

export const ffmpegCandidates = (): Array<string | undefined> => [config.FFMPEG_PATH, bundledFfmpegPath(), "ffmpeg"];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const kbps = (n: number) => `${Math.round(n)}k`;

/** quality 1–100 → x264 CRF (lower is better). Default CRF 23. */
export function x264Crf(quality?: number): number {
  return quality === undefined ? 23 : clamp(Math.round(40 - quality * 0.28), 12, 40);
}

/** quality 1–100 → VP9 CRF. Default 32. */
export function vp9Crf(quality?: number): number {
  return quality === undefined ? 32 : clamp(Math.round(50 - quality * 0.35), 15, 50);
}

/** quality 1–100 → libmp3lame -q:a (0 best … 9 worst). */
export function mp3VbrQuality(quality: number): number {
  return clamp(Math.round(9 - quality * 0.09), 0, 9);
}

export const MAX_VIDEO_DIM = 3840;

const AUDIO_ONLY = new Set(["mp3", "wav", "flac", "aac", "m4a", "ogg", "opus", "wma", "aiff", "amr"]);

function scaleFilter(o: ConversionOptions, evenDims: boolean): string | undefined {
  if (o.width || o.height) {
    // -2 keeps aspect ratio and rounds to an even number (required by yuv420p).
    return `scale=${o.width ?? -2}:${o.height ?? -2}`;
  }
  return evenDims ? "scale=trunc(iw/2)*2:trunc(ih/2)*2" : undefined;
}

function videoFilters(o: ConversionOptions, evenDims: boolean): string[] {
  const parts: string[] = [];
  const s = scaleFilter(o, evenDims);
  if (s) parts.push(s);
  if (o.fps) parts.push(`fps=${o.fps}`);
  return parts;
}

/** Demuxers allowed to read uploads (names as ffmpeg reports them; "mov" covers mp4/m4a/3gp, "matroska" covers webm, "ogg" covers opus/ogv). */
export const INPUT_DEMUXERS = "mov,matroska,avi,asf,flv,mpeg,mpegvideo,mpegts,ogg,mp3,wav,flac,aac,aiff,amr,amrnb,amrwb,gif";

/**
 * Pure argument builder — unit-tested. Everything that touches the command
 * line for ffmpeg is decided here.
 */
export function buildFfmpegArgs(input: string, output: string, toExt: string, o: ConversionOptions = {}): string[] {
  const target = getFormat(toExt)?.ext ?? toExt;
  // ffmpeg will upscale; cap the frame so a tiny clip can't become a 16K render.
  if (o.width) o = { ...o, width: Math.min(o.width, MAX_VIDEO_DIM) };
  if (o.height) o = { ...o, height: Math.min(o.height, MAX_VIDEO_DIM) };
  const args: string[] = ["-y", "-hide_banner", "-nostdin", "-loglevel", "error", "-nostats", "-progress", "pipe:1"];

  const start = o.trimStartSec ?? 0;
  if (start > 0) args.push("-ss", String(start));
  // Untrusted input: read it only as a plain local file, and only with the
  // container demuxers Anyform accepts. ffmpeg picks the demuxer from the
  // content, not the name, so without this an upload named .mp4 that is really
  // an HLS playlist or concat list could make ffmpeg open other local files or URLs.
  args.push("-protocol_whitelist", "file", "-format_whitelist", INPUT_DEMUXERS);
  args.push("-i", input);
  if (o.trimEndSec !== undefined && o.trimEndSec > start) args.push("-t", String(o.trimEndSec - start));

  if (AUDIO_ONLY.has(target)) {
    args.push("-vn");
    const br = o.audioBitrateKbps;
    switch (target) {
      case "mp3":
        args.push("-c:a", "libmp3lame");
        if (br) args.push("-b:a", kbps(br));
        else if (o.quality !== undefined) args.push("-q:a", String(mp3VbrQuality(o.quality)));
        else args.push("-b:a", "192k");
        break;
      case "wav":
        args.push("-c:a", "pcm_s16le");
        break;
      case "aiff":
        args.push("-c:a", "pcm_s16be");
        break;
      case "flac":
        args.push("-c:a", "flac", "-compression_level", "8");
        break;
      case "aac":
        args.push("-c:a", "aac", "-b:a", kbps(br ?? 192));
        break;
      case "m4a":
        args.push("-c:a", "aac", "-b:a", kbps(br ?? 192), "-movflags", "+faststart");
        break;
      case "ogg":
        args.push("-c:a", "libvorbis");
        if (br) args.push("-b:a", kbps(br));
        else args.push("-q:a", String(clamp(Math.round((o.quality ?? 60) / 10), 0, 10)));
        break;
      case "opus":
        args.push("-c:a", "libopus", "-b:a", kbps(br ?? 128));
        break;
      case "wma":
        args.push("-c:a", "wmav2", "-b:a", kbps(br ?? 192));
        break;
      case "amr":
        args.push("-c:a", "libopencore_amrnb", "-ar", "8000", "-ac", "1", "-b:a", "12.2k");
        break;
    }
    args.push(output);
    return args;
  }

  if (target === "gif") {
    const fps = o.fps ?? 12;
    const width = o.width ?? 480;
    const scale = o.height ? `scale=${o.width ?? -1}:${o.height}` : `scale=${width}:-1`;
    const chain = `fps=${fps},${scale}:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5`;
    args.push("-filter_complex", chain, "-loop", "0", "-an", output);
    return args;
  }

  // ── video targets ──────────────────────────────────────────────────────
  const vb = o.videoBitrateKbps;
  const ab = kbps(o.audioBitrateKbps ?? 160);
  const vf = videoFilters(o, true);
  const pushVf = () => {
    if (vf.length) args.push("-vf", vf.join(","));
  };
  const h264 = () => {
    args.push("-c:v", "libx264", "-preset", "medium", "-pix_fmt", "yuv420p");
    if (vb) args.push("-b:v", kbps(vb), "-maxrate", kbps(vb * 1.5), "-bufsize", kbps(vb * 3));
    else args.push("-crf", String(x264Crf(o.quality)));
    pushVf();
  };

  switch (target) {
    case "mp4":
    case "mov":
    case "mkv":
      h264();
      args.push("-c:a", "aac", "-b:a", ab);
      if (target !== "mkv") args.push("-movflags", "+faststart");
      break;
    case "3gp":
      args.push("-c:v", "libx264", "-profile:v", "baseline", "-level", "3.0", "-pix_fmt", "yuv420p", "-crf", String(x264Crf(o.quality)));
      pushVf();
      args.push("-c:a", "aac", "-b:a", "96k", "-ar", "44100", "-ac", "2");
      break;
    case "ts":
      h264();
      args.push("-c:a", "aac", "-b:a", ab, "-f", "mpegts");
      break;
    case "webm":
      // libvpx defaults to its slowest preset (cpu-used 0): a 10 s 360p clip took 200+ s.
      args.push("-c:v", "libvpx-vp9", "-deadline", "good", "-cpu-used", "4", "-row-mt", "1", "-pix_fmt", "yuv420p");
      if (vb) args.push("-b:v", kbps(vb));
      else args.push("-crf", String(vp9Crf(o.quality)), "-b:v", "0");
      pushVf();
      args.push("-c:a", "libopus", "-b:a", kbps(o.audioBitrateKbps ?? 128));
      break;
    case "ogv":
      args.push("-c:v", "libtheora", "-q:v", String(clamp(Math.round((o.quality ?? 70) / 10), 1, 10)));
      pushVf();
      args.push("-c:a", "libvorbis", "-q:a", "5");
      break;
    case "avi":
      args.push("-c:v", "mpeg4", "-vtag", "xvid", "-q:v", String(clamp(Math.round(12 - (o.quality ?? 70) / 10), 2, 12)));
      pushVf();
      args.push("-c:a", "libmp3lame", "-b:a", ab);
      break;
    case "wmv":
      args.push("-c:v", "wmv2", "-q:v", String(clamp(Math.round(12 - (o.quality ?? 70) / 10), 2, 12)));
      pushVf();
      args.push("-c:a", "wmav2", "-b:a", ab);
      break;
    case "flv":
      args.push("-c:v", "flv", "-q:v", String(clamp(Math.round(12 - (o.quality ?? 70) / 10), 2, 12)));
      pushVf();
      args.push("-c:a", "libmp3lame", "-ar", "44100", "-b:a", ab);
      break;
    case "mpeg":
      args.push("-c:v", "mpeg2video", "-q:v", String(clamp(Math.round(12 - (o.quality ?? 70) / 10), 2, 12)));
      pushVf();
      args.push("-c:a", "mp2", "-b:a", ab);
      break;
    default:
      // Unknown video container: let ffmpeg pick defaults for the extension.
      pushVf();
  }
  args.push(output);
  return args;
}

/** Parse "Duration: 00:01:23.45" from ffmpeg's stderr banner. Returns seconds or undefined. */
export function parseDuration(stderr: string): number | undefined {
  const m = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(stderr);
  if (!m) return undefined;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** Parse the latest out_time from `-progress pipe:1` output; returns seconds. */
export function parseProgressSeconds(chunk: string): number | undefined {
  let last: number | undefined;
  for (const line of chunk.split(/\r?\n/)) {
    const us = /^out_time_us=(\d+)/.exec(line) ?? /^out_time_ms=(\d+)/.exec(line);
    if (us) last = Number(us[1]) / 1_000_000;
    else {
      const t = /^out_time=(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(line);
      if (t) last = Number(t[1]) * 3600 + Number(t[2]) * 60 + Number(t[3]);
    }
  }
  return last;
}

export const ffmpegEngine: Engine = {
  name: "ffmpeg",
  probe: memo(async (): Promise<EngineInfo> => {
    const found = await findBinary(ffmpegCandidates(), ["-version"]);
    return { name: "ffmpeg", available: Boolean(found), version: found?.version };
  }),
  async convert(ctx: EngineContext): Promise<void> {
    const found = await findBinary(ffmpegCandidates(), ["-version"]);
    if (!found) throw new EngineError("ffmpeg", "ffmpeg is not installed");

    // 1. duration probe (exits non-zero on purpose: no output specified)
    const started = Date.now();
    // Same input restrictions as the real run, or a disguised playlist gets opened here.
    const probe = await run(
      found.path,
      ["-hide_banner", "-nostdin", "-protocol_whitelist", "file", "-format_whitelist", INPUT_DEMUXERS, "-i", ctx.inputPath],
      { timeoutMs: Math.min(60_000, ctx.timeoutMs) },
    );
    let duration = parseDuration(probe.stderr);
    if (duration !== undefined) {
      const start = ctx.options.trimStartSec ?? 0;
      const end = ctx.options.trimEndSec !== undefined ? Math.min(ctx.options.trimEndSec, duration) : duration;
      duration = Math.max(0.001, end - start);
    }

    // 2. the real run
    const args = buildFfmpegArgs(ctx.inputPath, ctx.outputPath, ctx.toExt, ctx.options);
    ctx.log(`ffmpeg ${args.join(" ")}`);
    const res = await run(found.path, args, {
      timeoutMs: Math.max(1000, ctx.timeoutMs - (Date.now() - started)),
      onStdout: (chunk) => {
        if (!duration) return;
        const secs = parseProgressSeconds(chunk);
        if (secs !== undefined) ctx.onProgress(Math.min(99, Math.round((secs / duration) * 100)));
      },
    });
    if (res.code !== 0) {
      throw new EngineError("ffmpeg", `ffmpeg failed: ${res.stderr.trim().split(/\r?\n/).slice(-3).join(" | ") || `exit ${res.code}`}`, res.stderr);
    }
  },
};
