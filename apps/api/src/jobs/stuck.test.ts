import { beforeEach, describe, expect, it, vi } from "vitest";
import pino from "pino";

const db = {
  findUnique: vi.fn(),
  findMany: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
  userUpdate: vi.fn(),
};

vi.mock("../db.js", () => ({
  prisma: {
    conversion: {
      findUnique: (...a: unknown[]) => db.findUnique(...a),
      findMany: (...a: unknown[]) => db.findMany(...a),
      updateMany: (...a: unknown[]) => db.updateMany(...a),
      update: (...a: unknown[]) => db.update(...a),
    },
    user: { update: (...a: unknown[]) => db.userUpdate(...a) },
  },
}));

const log = pino({ level: "silent" });

describe("stuck and duplicate conversions", () => {
  beforeEach(() => Object.values(db).forEach((f) => f.mockReset()));

  it("a second delivery of a job that is still running does not convert again", async () => {
    const { runConversion } = await import("./convert.js");
    db.findUnique.mockResolvedValue({ id: "c1", status: "processing", sourceKey: "src/x", sourceExt: "mp4", targetExt: "mp3" });
    db.updateMany.mockResolvedValue({ count: 0 });
    await expect(runConversion("c1", log)).resolves.toMatchObject({ ok: false, error: "already claimed" });
    expect(db.updateMany.mock.calls[0]?.[0]).toMatchObject({ where: { id: "c1", status: { in: ["queued", "failed"] } } });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("fails stalled rows and refunds a pack credit", async () => {
    const { failStuckConversions } = await import("./cleanup.js");
    db.findMany.mockResolvedValue([
      { id: "c1", userId: "u1", status: "processing" },
      { id: "c2", userId: null, status: "queued" },
    ]);
    // c1 flips to failed, then its credit flips to refunded; c2 finished meanwhile.
    db.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await expect(failStuckConversions(log)).resolves.toBe(1);
    expect(db.userUpdate).toHaveBeenCalledWith({ where: { id: "u1" }, data: { credits: { increment: 1 } } });
  });
});
