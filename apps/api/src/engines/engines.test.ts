import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildCalibreArgs } from "./calibre.js";
import { buildFfmpegArgs, INPUT_DEMUXERS, MAX_VIDEO_DIM } from "./ffmpeg.js";
import { buildMagickArgs, MAGICK_POLICY_DIR } from "./imagemagick.js";
import { buildPandocArgs, UNTRUSTED_FILTER } from "./pandoc.js";
import { buildSofficeArgs, hasMagic, windowsConsoleLauncher } from "./libreoffice.js";
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

  it("caps requested video dimensions instead of upscaling to 16K", () => {
    const args = buildFfmpegArgs("/t/in.mp4", "/t/o.mp4", "mp4", { width: 16384, height: 9000 });
    expect(args.join(" ")).toContain(`scale=${MAX_VIDEO_DIM}:${MAX_VIDEO_DIM}`);
  });
});

describe("calibre input hardening", () => {
  it("refuses hand-written text it would follow links out of", () => {
    for (const ext of ["md", "txt", "html"]) expect(() => buildCalibreArgs(`/t/in.${ext}`, "/t/o.mobi", ext, "mobi")).toThrow();
    expect(buildCalibreArgs("/t/in.epub", "/t/o.mobi", "epub", "mobi").slice(0, 2)).toEqual(["/t/in.epub", "/t/o.mobi"]);
  });
});

describe("pandoc sandbox", () => {
  it("runs every conversion with --sandbox", () => {
    expect(buildPandocArgs("/t/in.md", "/t/o.html", "md", "html", "/t/f.lua")[0]).toBe("--sandbox");
  });

  it("filters untrusted text inputs and insists on the filter", () => {
    for (const ext of ["md", "txt", "html"]) {
      const args = buildPandocArgs(`/t/in.${ext}`, "/t/o.epub", ext, "epub", "/t/f.lua");
      expect(args[args.indexOf("--lua-filter") + 1]).toBe("/t/f.lua");
      expect(() => buildPandocArgs(`/t/in.${ext}`, "/t/o.epub", ext, "epub")).toThrow();
    }
    expect(buildPandocArgs("/t/in.docx", "/t/o.md", "docx", "md")).not.toContain("--lua-filter");
  });

  it("strips raw HTML, local images and links, and metadata in the filter", () => {
    expect(UNTRUSTED_FILTER).toContain("RawBlock = function() return {} end");
    expect(UNTRUSTED_FILTER).toContain('el.src:match("^data:image/")');
    expect(UNTRUSTED_FILTER).toContain("Meta = function(m)");
  });
});

describe("libreoffice input checks", () => {
  it("refuses a page disguised as an office file", () => {
    const html = Buffer.from("<html><iframe src=file:///etc/passwd>");
    for (const ext of ["docx", "doc", "odt", "rtf", "xlsx", "pdf"]) expect(hasMagic(html, ext)).toBe(false);
    expect(hasMagic(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0]), "docx")).toBe(true);
    expect(hasMagic(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), "xls")).toBe(true);
    expect(hasMagic(Buffer.from("﻿{\\rtf1\\ansi"), "rtf")).toBe(true);
    expect(hasMagic(Buffer.from("%PDF-1.7"), "pdf")).toBe(true);
  });

  it("pins the import filter for plain text so it isn't sniffed as HTML", () => {
    expect(buildSofficeArgs("/t/in.txt", "/o", "/p", "txt", "pdf")).toContain("--infilter=Text (encoded):UTF8");
    expect(buildSofficeArgs("/t/in.csv", "/o", "/p", "csv", "xlsx").some((a) => a.startsWith("--infilter=Text - txt - csv"))).toBe(true);
    expect(buildSofficeArgs("/t/in.docx", "/o", "/p", "docx", "pdf").some((a) => a.startsWith("--infilter"))).toBe(false);
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
