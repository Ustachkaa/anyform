import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashResetToken } from "./reset.js";

const db = {
  userFind: vi.fn(),
  userUpdateMany: vi.fn(),
  evFindFirst: vi.fn(),
  evFindUnique: vi.fn(),
  evCreate: vi.fn(),
  evUpdate: vi.fn(),
  evDeleteMany: vi.fn(),
};

vi.mock("../db.js", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => db.userFind(...a), updateMany: (...a: unknown[]) => db.userUpdateMany(...a) },
    emailVerification: {
      findFirst: (...a: unknown[]) => db.evFindFirst(...a),
      findUnique: (...a: unknown[]) => db.evFindUnique(...a),
      create: (...a: unknown[]) => db.evCreate(...a),
      update: (...a: unknown[]) => db.evUpdate(...a),
      deleteMany: (...a: unknown[]) => db.evDeleteMany(...a),
    },
    $transaction: (ops: unknown[]) => Promise.all(ops),
  },
}));

const { consumeVerificationToken, sendVerificationLink } = await import("./verify.js");
const { sentMail } = await import("../mail/index.js");

const now = new Date("2026-10-30T12:00:00Z");
const row = (over: Record<string, unknown> = {}) => ({
  id: "v1",
  userId: "u1",
  email: "a@x.io",
  usedAt: null,
  expiresAt: new Date(now.getTime() + 60_000),
  user: { email: "a@x.io" },
  ...over,
});

describe("email verification", () => {
  beforeEach(() => {
    Object.values(db).forEach((f) => f.mockReset());
    db.evDeleteMany.mockResolvedValue({ count: 0 });
    db.evUpdate.mockResolvedValue({});
    sentMail.length = 0;
  });

  it("mails a link bound to the current address and stores only its hash", async () => {
    db.userFind.mockResolvedValue({ id: "u1", email: "a@x.io", emailVerifiedAt: null });
    db.evFindFirst.mockResolvedValue(null);
    db.evCreate.mockResolvedValue({});
    await sendVerificationLink("u1");
    const token = /token=([\w-]+)/.exec(sentMail.at(-1)!.text)![1]!;
    expect(sentMail.at(-1)!.to).toBe("a@x.io");
    expect(db.evCreate.mock.calls[0]![0].data).toMatchObject({ userId: "u1", email: "a@x.io", tokenHash: hashResetToken(token) });
  });

  it("sends nothing to an already verified account or inside the cooldown", async () => {
    db.userFind.mockResolvedValue({ id: "u1", email: "a@x.io", emailVerifiedAt: now });
    await sendVerificationLink("u1");
    db.userFind.mockResolvedValue({ id: "u1", email: "a@x.io", emailVerifiedAt: null });
    db.evFindFirst.mockResolvedValue({ id: "recent" });
    await sendVerificationLink("u1");
    expect(sentMail).toHaveLength(0);
  });

  it("verifies the address the link was sent to", async () => {
    db.evFindUnique.mockResolvedValue(row());
    db.userUpdateMany.mockResolvedValue({ count: 1 });
    await expect(consumeVerificationToken("t".repeat(43), now)).resolves.toBe(true);
    expect(db.userUpdateMany).toHaveBeenCalledWith({ where: { id: "u1", email: "a@x.io" }, data: { emailVerifiedAt: now } });
  });

  it("refuses used, expired, unknown links and links for a previous address", async () => {
    for (const r of [row({ usedAt: now }), row({ expiresAt: new Date(now.getTime() - 1) }), null, row({ user: { email: "new@x.io" } })]) {
      db.evFindUnique.mockResolvedValue(r);
      await expect(consumeVerificationToken("t".repeat(43), now)).resolves.toBe(false);
    }
    expect(db.userUpdateMany).not.toHaveBeenCalled();
  });

  it("does not verify a new address when the email changed between lookup and update", async () => {
    db.evFindUnique.mockResolvedValue(row());
    db.userUpdateMany.mockResolvedValue({ count: 0 });
    await expect(consumeVerificationToken("t".repeat(43), now)).resolves.toBe(false);
  });
});
