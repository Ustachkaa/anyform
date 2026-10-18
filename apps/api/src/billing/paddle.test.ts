import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SIGNATURE_TOLERANCE_SECONDS, verifyPaddleSignature } from "./paddle.js";
import { PriceMap } from "./prices.js";

const secret = "pdl_ntfset_test_secret";
const body = Buffer.from('{"event_type":"transaction.completed","data":{"id":"txn_1"}}');
const sign = (ts: number, b: Buffer = body, key = secret) => createHmac("sha256", key).update(`${ts}:`).update(b).digest("hex");

describe("Paddle webhook signature", () => {
  const now = 1_792_000_000;

  it("accepts a correct signature", () => {
    expect(verifyPaddleSignature(body, `ts=${now};h1=${sign(now)}`, secret, now)).toBe(true);
  });

  it("accepts any matching h1 (secret rotation)", () => {
    expect(verifyPaddleSignature(body, `ts=${now};h1=${"0".repeat(64)};h1=${sign(now)}`, secret, now)).toBe(true);
  });

  it("rejects a tampered body, wrong secret, or missing parts", () => {
    expect(verifyPaddleSignature(Buffer.from(body.toString().replace("txn_1", "txn_2")), `ts=${now};h1=${sign(now)}`, secret, now)).toBe(false);
    expect(verifyPaddleSignature(body, `ts=${now};h1=${sign(now, body, "other")}`, secret, now)).toBe(false);
    expect(verifyPaddleSignature(body, `h1=${sign(now)}`, secret, now)).toBe(false);
    expect(verifyPaddleSignature(body, `ts=${now}`, secret, now)).toBe(false);
    expect(verifyPaddleSignature(body, undefined, secret, now)).toBe(false);
    expect(verifyPaddleSignature(body, `ts=${now};h1=not-hex`, secret, now)).toBe(false);
  });

  it("rejects old (replayed) and far-future timestamps", () => {
    const old = now - SIGNATURE_TOLERANCE_SECONDS - 1;
    expect(verifyPaddleSignature(body, `ts=${old};h1=${sign(old)}`, secret, now)).toBe(false);
    const future = now + SIGNATURE_TOLERANCE_SECONDS + 1;
    expect(verifyPaddleSignature(body, `ts=${future};h1=${sign(future)}`, secret, now)).toBe(false);
  });
});

describe("price map", () => {
  const map = new PriceMap("PADDLE", {
    PADDLE_PRICE_PRO_YEARLY: "pri_pro_y",
    PADDLE_PRICE_PACK: "pri_pack",
    PADDLE_PRICE_PASS: "pri_pass",
    STRIPE_PRICE_PACK: "price_should_be_ignored",
  });

  it("maps configured ids both ways", () => {
    expect(map.lookup("pri_pro_y")).toEqual({ kind: "subscription", plan: "pro", interval: "year" });
    expect(map.lookup("pri_pack")).toEqual({ kind: "one_time", product: "pack" });
    expect(map.idFor({ kind: "one_time", product: "pass" })).toBe("pri_pass");
    expect(map.idFor({ kind: "subscription", plan: "pro", interval: "year" })).toBe("pri_pro_y");
  });

  it("knows nothing about unconfigured items or other providers' ids", () => {
    expect(map.idFor({ kind: "subscription", plan: "starter", interval: "month" })).toBeUndefined();
    expect(map.lookup("price_should_be_ignored")).toBeUndefined();
    expect(map.lookup(undefined)).toBeUndefined();
  });
});
