import { describe, expect, it } from "vitest";
import { hashResetToken } from "../auth/reset.js";
import { escapeHtml, passwordResetMail } from "./index.js";

describe("password reset email", () => {
  const link = "https://anyform.app/reset-password?token=abc_DEF-123";

  it("carries the link and its lifetime in both parts", () => {
    const m = passwordResetMail("nino@example.com", link, 60);
    expect(m.to).toBe("nino@example.com");
    expect(m.text).toContain(link);
    expect(m.text).toContain("60 minutes");
    expect(m.html).toContain(`href="${link}"`);
  });

  it("escapes the link in HTML", () => {
    expect(escapeHtml(`"><script>&'`)).toBe("&quot;&gt;&lt;script&gt;&amp;&#39;");
    expect(passwordResetMail("x@example.com", `${link}"><b>`, 60).html).not.toContain(`"><b>`);
  });
});

describe("reset token hashing", () => {
  it("is a stable SHA-256 hex digest, never the token itself", () => {
    expect(hashResetToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(hashResetToken("abc")).not.toContain("abc");
  });
});
