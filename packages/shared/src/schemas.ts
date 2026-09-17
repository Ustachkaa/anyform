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
      trimStartSec: z.number().min(0).optional(),
      trimEndSec: z.number().min(0).optional(),
      pages: z.string().regex(/^[0-9,\-]+$/).max(64).optional(),
    })
    .partial()
    .optional(),
});
export type CreateConversionFields = z.infer<typeof createConversionFieldsSchema>;
export type ConversionOptions = NonNullable<CreateConversionFields["options"]>;

export const checkoutSchema = z.object({
  plan: z.enum(PAID_PLANS as unknown as [string, ...string[]]),
  interval: z.enum(["month", "year"]).default("month"),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;
