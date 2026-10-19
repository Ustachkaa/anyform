import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildFfmpegArgs, INPUT_DEMUXERS } from "./ffmpeg.js";
import { buildMagickArgs, MAGICK_POLICY_DIR } from "./imagemagick.js";
import { buildPandocArgs } from "./pandoc.js";
import { windowsConsoleLauncher } from "./libreoffice.js";
import { buildPdftohtmlArgs } from "./poppler.js";
import { memo } from "./types.js";

describe("imagemagick args", () => {
  it("reads only the first frame for single-image targets", () => {
    expect(buildMagickArgs("/t/in.gif", "/t/o.bmp", "gif", "bmp", {})[0]).toBe("GIF:/t/in.gif[0]");
    expect(buildMagickArgs("/t/in.heic", "/t/o.jpg", "heic", "jpg", {})[0]).toBe("HEIC:/t/in.heic[0]");
    expect(buildMagickArgs("/t/in.heic", "/t/o.png", "heic", "png", {})[0]).toBe("HEIC:/t/in.heic[0]");
  });

  it("keeps every frame for targets that can hold several", () => {
    expect(buildMagickArgs("/t/in.gif", "/t/o.webp", "gif", "webp", {})[0]).toBe("GIF:/t/in.gif");
    expect(buildMagickArgs("/t/in.heic", "/t/o.pdf", "heic", "pdf", {})[0]).toBe("HEIC:/t/in.heic");
  });
});

describe("imagemagick input hardening", () => {
  it("always pins the input coder, so content can't pick a script format", () => {
    for (const [ext, coder] of [["jpg", "JPEG"], ["png", "PNG"], ["bmp", "BMP"], ["tiff", "TIFF"], ["ico", "ICO"], ["webp", "WEBP"], ["avif", "AVIF"]]) {
      expect(buildMagickArgs(`/t/in.${ext}`, "/t/o.pdf", ext, "pdf", {})[0]).toBe(`${coder}:/t/in.${ext}`);
    }
  });

  it("refuses formats it should never read directly (svg is rasterised by sharp first)", () => {
    expect(() => buildMagickArgs("/t/in.svg", "/t/o.bmp", "svg", "bmp", {})).toThrow();
    expect(() => buildMagickArgs("/t/in.mvg", "/t/o.png", "mvg", "png", {})).toThrow();
  });

  it("ships a policy that blocks script/URL coders and all delegates", () => {
    const policy = readFileSync(path.join(MAGICK_POLICY_DIR, "policy.xml"), "utf8");
    expect(policy).toContain('<policy domain="delegate" rights="none" pattern="*"/>');
    for (const c of ["MVG", "MSL", "URL", "HTTPS", "TEXT", "EPHEMERAL"]) expect(policy).toContain(c);
  });
});

describe("ffmpeg input hardening", () => {
  it("reads uploads only as local files with allowed demuxers", () => {
    const args = buildFfmpegArgs("/t/in.mp4", "/t/o.mp3", "mp3");
    expect(args[args.indexOf("-protocol_whitelist") + 1]).toBe("file");
    expect(args[args.indexOf("-format_whitelist") + 1]).toBe(INPUT_DEMUXERS);
    expect(args.indexOf("-format_whitelist")).toBeLessThan(args.indexOf("-i"));
    for (const bad of ["hls", "concat", "image2", "lavfi", "tty"]) expect(INPUT_DEMUXERS.split(",")).not.toContain(bad);
  });
});

describe("pandoc sandbox", () => {
  it("runs every conversion with --sandbox", () => {
    expect(buildPandocArgs("/t/in.md", "/t/o.html", "md", "html")[0]).toBe("--sandbox");
  });
});

describe("libreoffice launcher on Windows", () => {
  const platform = process.platform;
  afterEach(() => Object.defineProperty(process, "platform", { value: platform }));

  it("tries soffice.com before a configured soffice.exe", () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    expect(windowsConsoleLauncher("C:\\LO\\program\\soffice.exe")).toEqual(["C:\\LO\\program\\soffice.com", "C:\\LO\\program\\soffice.exe"]);
    expect(windowsConsoleLauncher("C:\\LO\\program\\soffice.com")).toEqual(["C:\\LO\\program\\soffice.com"]);
    expect(windowsConsoleLauncher(undefined)).toEqual([undefined]);
  });

  it("leaves other platforms alone", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    expect(windowsConsoleLauncher("/opt/soffice.exe")).toEqual(["/opt/soffice.exe"]);
  });
});

describe("pdftohtml args", () => {
  it("writes one self-contained UTF-8 file", () => {
    expect(buildPdftohtmlArgs("/t/in.pdf", "/t/o.html")).toEqual(["-q", "-s", "-i", "-noframes", "-enc", "UTF-8", "/t/in.pdf", "/t/o.html"]);
  });
});

describe("probe memo", () => {
  afterEach(() => vi.useRealTimers());

  it("caches an available engine for good", async () => {
    const fn = vi.fn(async () => ({ name: "x", available: true }));
    const probe = memo(fn, 1000);
    await probe();
    await probe();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("re-probes an unavailable engine after the retry window", async () => {
    vi.useFakeTimers();
    let up = false;
    const fn = vi.fn(async () => ({ name: "x", available: up }));
    const probe = memo(fn, 1000);
    expect((await probe()).available).toBe(false);
    up = true;
    expect((await probe()).available).toBe(false); // still inside the window
    vi.advanceTimersByTime(1001);
    expect((await probe()).available).toBe(true);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
