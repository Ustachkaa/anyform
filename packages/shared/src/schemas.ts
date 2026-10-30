import { z } from "zod";
import { PAID_PLANS } from "./plans.js";

/** Request validation shared by client-side forms and the API. */

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(128, "That is a very long password — 128 characters is the maximum");

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1).max(80).optional(),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/, "This reset link is invalid."),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** Profile edits. Changing the email needs the current password; a name-only edit does not. */
export const updateProfileSchema = z
  .object({
    name: z.string().trim().max(80).nullable().optional(),
    email: emailSchema.optional(),
    currentPassword: z.string().min(1).max(128).optional(),
  })
  .refine((v) => v.name !== undefined || v.email !== undefined, { message: "Nothing to update." })
  .refine((v) => v.email === undefined || !!v.currentPassword, {
    message: "Enter your current password to change your email.",
    path: ["currentPassword"],
  });
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password").max(128),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const deleteAccountSchema = z.object({
  password: z.string().min(1, "Enter your password to confirm").max(128),
});
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

/** Multipart field values arrive as strings, so this validates the text part. */
export const createConversionFieldsSchema = z.object({
  target: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]{1,8}$/, "Target must be a file extension like mp3"),
  /** Optional engine options; kept loose and validated per-engine in the worker. */
  options: z
    .object({
      quality: z.number().int().min(1).max(100).optional(),
      width: z.number().int().min(1).max(16384).optional(),
      height: z.number().int().min(1).max(16384).optional(),
      fps: z.number().min(1).max(120).optional(),
      audioBitrateKbps: z.number().int().min(32).max(512).optional(),
      videoBitrateKbps: z.number().int().min(100).max(50000).optional(),
      trimStartSec: z.number().min(0).max(86_400).optional(),
      trimEndSec: z.number().min(0).max(86_400).optional(),
      pages: z.string().regex(/^[0-9,\-]+$/).max(64).optional(),
    })
    .partial()
    .optional(),
});
export type CreateConversionFields = z.infer<typeof createConversionFieldsSchema>;
export type ConversionOptions = NonNullable<CreateConversionFields["options"]>;

/** Either a subscription (`plan` + `interval`) or a one-time `product` (pack or 24-hour pass). */
export const checkoutSchema = z.union([
  z.object({ product: z.enum(["pack", "pass"]) }).strict(),
  z.object({
    plan: z.enum(PAID_PLANS as unknown as [string, ...string[]]),
    interval: z.enum(["month", "year"]).default("month"),
  }),
]);
export type CheckoutInput = z.infer<typeof checkoutSchema>;
