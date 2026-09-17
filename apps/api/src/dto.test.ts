import { describe, expect, it } from "vitest";
import type { Conversion } from "@prisma/client";
import { conversionToDTO } from "./dto.js";

const base: Conversion = {
  id: "abc",
  userId: null,
  guestId: "g1",
  status: "done",
  progress: 100,
  sourceName: "holiday.mov",
  sourceExt: "mov",
  targetExt: "mp4",
  sourceBytes: BigInt(3_000_000_000),
  outputBytes: BigInt(1_500_000),
  sourceKey: "src/2026/09/abc.mov",
  outputKey: "out/2026/09/abc.mp4",
  outputName: "holiday.mp4",
  engine: "ffmpeg",
  error: null,
  options: null,
  ipHash: null,
  createdAt: new Date("2026-09-17T10:00:00Z"),
  startedAt: new Date("2026-09-17T10:00:01Z"),
  finishedAt: new Date("2026-09-17T10:00:09Z"),
  expiresAt: new Date("2026-09-17T12:00:00Z"),
};

describe("conversionToDTO", () => {
  it("converts BigInt and dates and exposes a download url when done", () => {
    const dto = conversionToDTO(base, new Date("2026-09-17T11:00:00Z"));
    expect(dto.sourceBytes).toBe(3_000_000_000);
    expect(dto.outputBytes).toBe(1_500_000);
    expect(dto.createdAt).toBe("2026-09-17T10:00:00.000Z");
    expect(dto.downloadUrl).toBe("/v1/conversions/abc/download");
    expect(dto.status).toBe("done");
  });

  it("hides the download url when expired, not done, or output missing", () => {
    expect(conversionToDTO(base, new Date("2026-09-17T12:00:01Z")).downloadUrl).toBeNull();
    expect(conversionToDTO({ ...base, status: "processing", progress: 40 }).downloadUrl).toBeNull();
    expect(conversionToDTO({ ...base, outputKey: null }).downloadUrl).toBeNull();
  });

  it("clamps progress and coerces unknown statuses to failed", () => {
    const dto = conversionToDTO({ ...base, status: "weird", progress: 250 });
    expect(dto.status).toBe("failed");
    expect(dto.progress).toBe(100);
  });
});
