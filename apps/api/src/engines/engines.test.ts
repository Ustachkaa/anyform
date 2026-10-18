import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMagickArgs } from "./imagemagick.js";
import { windowsConsoleLauncher } from "./libreoffice.js";
import { buildPdftohtmlArgs } from "./poppler.js";
import { memo } from "./types.js";

describe("imagemagick args", () => {
  it("reads only the first frame for single-image targets", () => {
    expect(buildMagickArgs("/t/in.gif", "/t/o.bmp", "gif", "bmp", {})[0]).toBe("/t/in.gif[0]");
    expect(buildMagickArgs("/t/in.heic", "/t/o.jpg", "heic", "jpg", {})[0]).toBe("HEIC:/t/in.heic[0]");
    expect(buildMagickArgs("/t/in.heic", "/t/o.png", "heic", "png", {})[0]).toBe("HEIC:/t/in.heic[0]");
  });

  it("keeps every frame for targets that can hold several", () => {
    expect(buildMagickArgs("/t/in.gif", "/t/o.webp", "gif", "webp", {})[0]).toBe("/t/in.gif");
    expect(buildMagickArgs("/t/in.heic", "/t/o.pdf", "heic", "pdf", {})[0]).toBe("HEIC:/t/in.heic");
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
