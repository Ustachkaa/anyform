import { describe, expect, it } from "vitest";
import { buildFfmpegArgs, mp3VbrQuality, parseDuration, parseProgressSeconds, vp9Crf, x264Crf } from "./ffmpeg.js";

const IN = "/tmp/job/input.mov";
const OUT = "/tmp/job/output.mp4";

function after(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

describe("buildFfmpegArgs", () => {
  it("always disables interaction and reports progress on stdout", () => {
    const args = buildFfmpegArgs(IN, OUT, "mp4");
    expect(args.slice(0, 2)).toEqual(["-y", "-hide_banner"]);
    expect(args).toContain("-nostdin");
    expect(after(args, "-progress")).toBe("pipe:1");
    expect(args.at(-1)).toBe(OUT);
    expect(after(args, "-i")).toBe(IN);
  });

  it("uses h264/aac with faststart for mp4", () => {
    const args = buildFfmpegArgs(IN, OUT, "mp4");
    expect(after(args, "-c:v")).toBe("libx264");
    expect(after(args, "-c:a")).toBe("aac");
    expect(after(args, "-crf")).toBe("23");
    expect(after(args, "-movflags")).toBe("+faststart");
    expect(after(args, "-vf")).toBe("scale=trunc(iw/2)*2:trunc(ih/2)*2");
  });

  it("maps quality and bitrate options", () => {
    const q = buildFfmpegArgs(IN, OUT, "mp4", { quality: 100 });
    expect(after(q, "-crf")).toBe("12");
    const br = buildFfmpegArgs(IN, OUT, "mp4", { videoBitrateKbps: 2500, audioBitrateKbps: 128 });
    expect(after(br, "-b:v")).toBe("2500k");
    expect(after(br, "-b:a")).toBe("128k");
    expect(br).not.toContain("-crf");
  });

  it("applies scale, fps and trim", () => {
    const args = buildFfmpegArgs(IN, OUT, "mp4", { width: 1280, fps: 30, trimStartSec: 5, trimEndSec: 15 });
    expect(after(args, "-vf")).toBe("scale=1280:-2,fps=30");
    expect(after(args, "-ss")).toBe("5");
    expect(after(args, "-t")).toBe("10");
    // -ss must be an input option (before -i) for fast seeking
    expect(args.indexOf("-ss")).toBeLessThan(args.indexOf("-i"));
  });

  it("uses vp9/opus for webm", () => {
    const args = buildFfmpegArgs(IN, "/tmp/o.webm", "webm");
    expect(after(args, "-c:v")).toBe("libvpx-vp9");
    expect(after(args, "-c:a")).toBe("libopus");
    expect(after(args, "-crf")).toBe("32");
    expect(after(args, "-b:v")).toBe("0");
    // not libvpx's default slowest preset
    expect(after(args, "-deadline")).toBe("good");
    expect(after(args, "-cpu-used")).toBe("4");
  });

  it("builds a palette filter graph for gif", () => {
    const args = buildFfmpegArgs(IN, "/tmp/o.gif", "gif", { fps: 10, width: 320 });
    const fc = after(args, "-filter_complex")!;
    expect(fc.startsWith("fps=10,scale=320:-1")).toBe(true);
    expect(fc).toContain("palettegen");
    expect(fc).toContain("paletteuse");
    expect(args).toContain("-an");
    expect(after(args, "-loop")).toBe("0");
  });

  it("strips video and picks codecs for audio targets", () => {
    const mp3 = buildFfmpegArgs(IN, "/tmp/o.mp3", "mp3");
    expect(mp3).toContain("-vn");
    expect(after(mp3, "-c:a")).toBe("libmp3lame");
    expect(after(mp3, "-b:a")).toBe("192k");

    const mp3q = buildFfmpegArgs(IN, "/tmp/o.mp3", "mp3", { quality: 100 });
    expect(after(mp3q, "-q:a")).toBe("0");

    expect(after(buildFfmpegArgs(IN, "/tmp/o.wav", "wav"), "-c:a")).toBe("pcm_s16le");
    expect(after(buildFfmpegArgs(IN, "/tmp/o.flac", "flac"), "-c:a")).toBe("flac");
    expect(after(buildFfmpegArgs(IN, "/tmp/o.opus", "opus"), "-c:a")).toBe("libopus");
    expect(after(buildFfmpegArgs(IN, "/tmp/o.m4a", "m4a"), "-c:a")).toBe("aac");
  });

  it("never interprets arguments as a shell", () => {
    const evil = "/tmp/$(rm -rf ~)/in;ls.mov";
    const args = buildFfmpegArgs(evil, OUT, "mp4");
    expect(after(args, "-i")).toBe(evil); // passed through verbatim as a single argv entry
  });
});

describe("quality maps", () => {
  it("clamp to codec ranges", () => {
    expect(x264Crf()).toBe(23);
    expect(x264Crf(0)).toBe(40);
    expect(x264Crf(100)).toBe(12);
    expect(vp9Crf()).toBe(32);
    expect(vp9Crf(100)).toBe(15);
    expect(mp3VbrQuality(100)).toBe(0);
    expect(mp3VbrQuality(0)).toBe(9);
  });
});

describe("ffmpeg output parsing", () => {
  it("parses the duration banner", () => {
    expect(parseDuration("Input #0, mov,mp4\n  Duration: 00:01:23.45, start: 0.000000, bitrate: 1200 kb/s")).toBeCloseTo(83.45, 2);
    expect(parseDuration("no duration here")).toBeUndefined();
  });

  it("parses -progress output in any of its time formats", () => {
    expect(parseProgressSeconds("frame=10\nout_time_us=12500000\nprogress=continue\n")).toBe(12.5);
    expect(parseProgressSeconds("out_time_ms=3000000\n")).toBe(3);
    expect(parseProgressSeconds("out_time=00:00:42.50\n")).toBe(42.5);
    expect(parseProgressSeconds("speed=2x\n")).toBeUndefined();
  });
});
