import { describe, expect, it } from "vitest";
import { allPairs } from "@anyform/shared";
import { candidatesFor } from "./registry.js";

const names = (from: string, to: string) => candidatesFor(from, to).map((e) => e.name);

describe("engine registry resolution order", () => {
  it("routes media through ffmpeg", () => {
    expect(names("mp4", "mp3")).toEqual(["ffmpeg"]);
    expect(names("mov", "mp4")).toEqual(["ffmpeg"]);
    expect(names("wav", "flac")).toEqual(["ffmpeg"]);
    expect(names("mp4", "gif")).toEqual(["ffmpeg"]);
    expect(names("gif", "mp4")).toEqual(["ffmpeg"]);
  });

  it("prefers sharp for raster images and falls back to imagemagick", () => {
    expect(names("png", "jpg")).toEqual(["sharp", "imagemagick"]);
    expect(names("svg", "png")).toEqual(["sharp", "imagemagick"]);
    expect(names("heic", "jpg")).toEqual(["imagemagick"]);
    expect(names("png", "ico")).toEqual(["imagemagick"]);
  });

  it("uses pdf-lib for image → pdf and poppler for pdf → image/text", () => {
    expect(names("jpg", "pdf")).toEqual(["pdf-lib", "imagemagick"]);
    expect(names("bmp", "pdf")).toEqual(["imagemagick"]);
    expect(names("pdf", "png")).toEqual(["poppler", "imagemagick"]);
    expect(names("pdf", "txt")).toEqual(["poppler", "libreoffice"]);
    expect(names("pdf", "docx")).toEqual(["libreoffice"]);
  });

  it("handles documents with libreoffice/pandoc and chains where needed", () => {
    expect(names("docx", "pdf")).toEqual(["libreoffice"]);
    expect(names("pptx", "pdf")).toEqual(["libreoffice"]);
    expect(names("xlsx", "csv")).toEqual(["libreoffice"]);
    expect(names("md", "docx")).toEqual(["pandoc"]);
    expect(names("md", "pdf")).toEqual(["pandoc+libreoffice"]);
    expect(names("docx", "odt")).toEqual(["libreoffice", "pandoc"]);
    expect(names("docx", "md")).toEqual(["pandoc"]);
  });

  it("handles ebooks with calibre first", () => {
    expect(names("epub", "mobi")).toEqual(["calibre"]);
    expect(names("epub", "fb2")).toEqual(["calibre", "pandoc"]);
    expect(names("epub", "pdf")).toEqual(["calibre"]);
    expect(names("docx", "epub")).toEqual(["pandoc", "calibre"]);
    expect(names("mobi", "html")).toEqual(["calibre+pandoc"]);
  });

  it("returns nothing for unsupported pairs", () => {
    expect(names("mp3", "mp4")).toEqual([]);
    expect(names("png", "docx")).toEqual([]);
    expect(names("nope", "mp4")).toEqual([]);
  });

  it("has at least one engine for every pair the registry advertises", () => {
    const missing = allPairs()
      .filter(({ from, to }) => candidatesFor(from.ext, to.ext).length === 0)
      .map(({ from, to }) => `${from.ext}->${to.ext}`);
    expect(missing).toEqual([]);
  });
});
