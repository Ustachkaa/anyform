import { describe, expect, it } from "vitest";
import {
  FORMATS,
  POPULAR_PAIRS,
  allPairs,
  canConvert,
  extOf,
  getFormat,
  parsePairSlug,
  pairSlug,
  targetsFor,
} from "./formats.js";
import { computeQuota } from "./quota.js";
import { PLANS, yearlySavingsPct } from "./plans.js";
import { formatBytes, replaceExt, safeFilename } from "./util.js";

describe("format registry", () => {
  it("has unique canonical extensions and aliases", () => {
    const seen = new Set<string>();
    for (const f of FORMATS) {
      for (const k of [f.ext, ...(f.aliases ?? [])]) {
        expect(seen.has(k), `duplicate extension ${k}`).toBe(false);
        seen.add(k);
      }
    }
  });

  it("resolves aliases and dotted, upper-case input", () => {
    expect(getFormat("JPEG")?.ext).toBe("jpg");
    expect(getFormat(".Tif")?.ext).toBe("tiff");
    expect(getFormat("m4v")?.ext).toBe("mp4");
    expect(getFormat("nope")).toBeUndefined();
  });

  it("extracts extensions from filenames", () => {
    expect(extOf("holiday.MOV")).toBe("mov");
    expect(extOf("archive.tar.gz")).toBe("gz");
    expect(extOf("README")).toBe("");
  });

  it("allows same-category and whitelisted cross-category pairs only", () => {
    const g = (e: string) => getFormat(e)!;
    expect(canConvert(g("mp4"), g("mp3"))).toBe(true);
    expect(canConvert(g("mp4"), g("gif"))).toBe(true);
    expect(canConvert(g("gif"), g("mp4"))).toBe(true);
    expect(canConvert(g("png"), g("pdf"))).toBe(true);
    expect(canConvert(g("pdf"), g("jpg"))).toBe(true);
    expect(canConvert(g("pptx"), g("pdf"))).toBe(true);
    expect(canConvert(g("epub"), g("pdf"))).toBe(true);
    // not allowed
    expect(canConvert(g("mp3"), g("mp4"))).toBe(false);
    expect(canConvert(g("png"), g("docx"))).toBe(false);
    expect(canConvert(g("jpg"), g("heic"))).toBe(false); // heic is input-only
    expect(canConvert(g("mp4"), g("mp4"))).toBe(false);
  });

  it("every popular pair is actually convertible", () => {
    for (const [a, b] of POPULAR_PAIRS) {
      expect(parsePairSlug(pairSlug(a, b)), `${a}-to-${b}`).toBeDefined();
    }
  });

  it("offers a sensible number of pairs", () => {
    const n = allPairs().length;
    expect(n).toBeGreaterThan(200);
    expect(targetsFor(getFormat("mp4")!).map((t) => t.ext)).toContain("mp3");
  });

  it("rejects malformed slugs", () => {
    expect(parsePairSlug("mp4-mp3")).toBeUndefined();
    expect(parsePairSlug("mp4-to-nope")).toBeUndefined();
  });
});

describe("quota", () => {
  it("counts down for free users and is unlimited for paid", () => {
    const q = computeQuota("free", 7, { freeConversions: 10, period: "lifetime" });
    expect(q.remaining).toBe(3);
    expect(q.exhausted).toBe(false);
    expect(computeQuota("free", 10).exhausted).toBe(true);
    expect(computeQuota("pro", 9999).limit).toBeNull();
  });

  it("reports a reset date only for monthly periods", () => {
    expect(computeQuota("free", 0, { freeConversions: 10, period: "lifetime" }).resetsAt).toBeNull();
    expect(computeQuota("free", 0, { freeConversions: 10, period: "monthly" }).resetsAt).toMatch(/^\d{4}-\d{2}-01T/);
  });
});

describe("plans & util", () => {
  it("yearly billing saves roughly a quarter", () => {
    expect(yearlySavingsPct(PLANS.starter)).toBe(25);
    expect(yearlySavingsPct(PLANS.pro)).toBe(20);
  });

  it("formats bytes and filenames", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe("2 GB");
    expect(replaceExt("holiday.MOV", "mp4")).toBe("holiday.mp4");
    expect(safeFilename("../../etc/passwd")).toBe("passwd");
  });
});
