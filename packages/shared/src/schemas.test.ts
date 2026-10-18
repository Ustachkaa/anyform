import { describe, expect, it } from "vitest";
import { changePasswordSchema, deleteAccountSchema, forgotPasswordSchema, resetPasswordSchema, updateProfileSchema } from "./schemas.js";

describe("account schemas", () => {
  it("normalises the forgot-password email", () => {
    expect(forgotPasswordSchema.parse({ email: "  Nino@Example.COM " })).toEqual({ email: "nino@example.com" });
  });

  it("accepts base64url reset tokens and rejects anything else", () => {
    const token = "a".repeat(43);
    expect(resetPasswordSchema.safeParse({ token, password: "long-enough" }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ token: "short", password: "long-enough" }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ token: `${"a".repeat(40)}<script>`, password: "long-enough" }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ token, password: "short" }).success).toBe(false);
  });

  it("lets a name change through without a password", () => {
    expect(updateProfileSchema.safeParse({ name: "Nino" }).success).toBe(true);
    expect(updateProfileSchema.safeParse({ name: null }).success).toBe(true);
  });

  it("requires the current password to change the email", () => {
    const res = updateProfileSchema.safeParse({ email: "new@example.com" });
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.path).toEqual(["currentPassword"]);
    expect(updateProfileSchema.safeParse({ email: "new@example.com", currentPassword: "x" }).success).toBe(true);
  });

  it("rejects an empty profile update", () => {
    expect(updateProfileSchema.safeParse({}).success).toBe(false);
  });

  it("holds new passwords to the signup rule", () => {
    expect(changePasswordSchema.safeParse({ currentPassword: "old", newPassword: "short" }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ currentPassword: "old", newPassword: "long-enough" }).success).toBe(true);
    expect(deleteAccountSchema.safeParse({ password: "" }).success).toBe(false);
  });
});
