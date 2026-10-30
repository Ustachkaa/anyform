import type { PlanId, BillingInterval } from "./plans.js";
import type { QuotaState } from "./quota.js";

/** Wire types shared between the API and the web app. Keep them JSON-safe. */

export type ConversionStatus = "queued" | "processing" | "done" | "failed";

export interface ConversionDTO {
  id: string;
  status: ConversionStatus;
  /** 0–100 */
  progress: number;
  sourceName: string;
  sourceExt: string;
  targetExt: string;
  sourceBytes: number;
  outputBytes: number | null;
  outputName: string | null;
  engine: string | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  expiresAt: string;
  /** Relative API path to download the result once status === "done". */
  downloadUrl: string | null;
}

export interface UserDTO {
  id: string;
  email: string;
  /** The owner has confirmed they read mail at `email`; required before buying. */
  emailVerified: boolean;
  name: string | null;
  plan: PlanId;
  createdAt: string;
  subscription: SubscriptionDTO | null;
}

export interface SubscriptionDTO {
  plan: PlanId;
  interval: BillingInterval;
  status: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
}

export interface UsageDTO extends QuotaState {
  maxFileBytes: number;
  concurrentJobs: number;
  retentionHours: number;
}

export type ApiErrorCode =
  | "VALIDATION"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "QUOTA_EXCEEDED"
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_FORMAT"
  | "UNSUPPORTED_CONVERSION"
  | "TOO_MANY_CONCURRENT"
  | "ENGINE_UNAVAILABLE"
  | "CONVERSION_FAILED"
  | "NOT_READY"
  | "EXPIRED"
  | "RATE_LIMITED"
  | "BILLING_UNAVAILABLE"
  | "INTERNAL";

export interface ApiError {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
}

export interface CreateConversionResponse {
  conversion: ConversionDTO;
  usage: UsageDTO;
}

export interface CheckoutResponse {
  url: string;
}

export interface AuthResponse {
  user: UserDTO;
}

export interface EngineInfo {
  name: string;
  available: boolean;
  version?: string;
}

export interface HealthResponse {
  ok: boolean;
  version: string;
  uptimeSeconds: number;
  engines?: EngineInfo[];
}
