import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { allPairs } from "@anyform/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sanitiseErrorMessage } from "../http.js";
import { locateOutput, noOutputMessage } from "./output.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "anyform-output-test-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("locateOutput", () => {
  it("accepts a non-empty output file", async () => {
    await writeFile(path.join(dir, "output.jpg"), "abc");
    expect(await locateOutput(path.join(dir, "output.jpg"))).toEqual({ ok: true, bytes: 3 });
  });

  it("adopts the first numbered sibling (output-0.jpg, output-1.jpg, … → output.jpg)", async () => {
    await writeFile(path.join(dir, "output-1.jpg"), "second");
    await writeFile(path.join(dir, "output-0.jpg"), "first");
    await writeFile(path.join(dir, "output-10.jpg"), "eleventh");
    const res = await locateOutput(path.join(dir, "output.jpg"));
    expect(res).toEqual({ ok: true, bytes: 5 });
    expect((await readdir(dir)).sort()).toEqual(["output-1.jpg", "output-10.jpg", "output.jpg"]);
  });

  it("ignores other files and other extensions", async () => {
    await writeFile(path.join(dir, "input.jpg"), "src");
    await writeFile(path.join(dir, "output-0.png"), "png");
    expect(await locateOutput(path.join(dir, "output.jpg"))).toEqual({ ok: false, reason: "missing" });
  });

  it("reports an empty output", async () => {
    await writeFile(path.join(dir, "output.txt"), "");
    expect(await locateOutput(path.join(dir, "output.txt"))).toEqual({ ok: false, reason: "empty" });
  });

  it("treats whitespace-only text as empty (pdftotext on a scanned PDF writes a lone form feed)", async () => {
    await writeFile(path.join(dir, "output.txt"), "\f");
    expect(await locateOutput(path.join(dir, "output.txt"))).toEqual({ ok: false, reason: "empty" });
    await writeFile(path.join(dir, "output.md"), "﻿ \r\n\t");
    expect(await locateOutput(path.join(dir, "output.md"))).toEqual({ ok: false, reason: "empty" });
  });

  it("does not apply the blank-text rule to other formats", async () => {
    await writeFile(path.join(dir, "output.html"), "   ");
    expect(await locateOutput(path.join(dir, "output.html"))).toEqual({ ok: true, bytes: 3 });
  });
});

describe("noOutputMessage", () => {
  it("explains a text-less PDF in plain words", () => {
    const msg = noOutputMessage("pdf", "txt", "empty");
    expect(msg).toContain("couldn't find any text");
    expect(msg).toContain("Scanned PDFs");
    expect(msg).toContain("didn't count toward your conversions");
  });

  it("names both formats when no file came out", () => {
    const msg = noOutputMessage("heic", "jpg", "missing");
    expect(msg).toContain("This .heic couldn't become a .jpg");
    expect(msg).not.toMatch(/engine/i);
  });

  it("fits the web app's 160-character error display for every pair", () => {
    for (const { from, to } of allPairs()) {
      for (const reason of ["missing", "empty"] as const) {
        expect(noOutputMessage(from.ext, to.ext, reason).length, `${from.ext}->${to.ext} ${reason}`).toBeLessThanOrEqual(160);
      }
    }
  });

  it("survives the error sanitiser unchanged", () => {
    for (const [f, t, r] of [["pdf", "txt", "empty"], ["heic", "jpg", "missing"], ["docx", "pdf", "empty"]] as const) {
      const msg = noOutputMessage(f, t, r);
      expect(sanitiseErrorMessage(new Error(msg))).toBe(msg);
    }
  });
});
