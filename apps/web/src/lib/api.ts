import type {
  ApiError,
  ApiErrorCode,
  AuthResponse,
  BillingInterval,
  CheckoutResponse,
  ConversionDTO,
  CreateConversionResponse,
  LoginInput,
  PlanId,
  SignupInput,
  UsageDTO,
  UserDTO,
} from "@anyform/shared";

/**
 * Browser-side client for the Anyform API. Every call goes to `/api/...` on
 * the current origin; next.config.ts rewrites that to the Fastify server, so
 * cookies are first-party and there is no CORS.
 */

export class ApiClientError extends Error {
  readonly code: ApiErrorCode | "NETWORK";
  readonly status: number;
  readonly details: unknown;

  constructor(code: ApiErrorCode | "NETWORK", message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function isApiError(v: unknown): v is ApiError {
  return typeof v === "object" && v !== null && "error" in v && typeof (v as ApiError).error?.code === "string";
}

function toError(status: number, body: unknown): ApiClientError {
  if (isApiError(body)) return new ApiClientError(body.error.code, body.error.message, status, body.error.details);
  return new ApiClientError("INTERNAL", `Request failed (${status})`, status);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      credentials: "same-origin",
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new ApiClientError("NETWORK", "Could not reach the server. Check your connection and try again.", 0);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  if (!res.ok) throw toError(res.status, body);
  return body as T;
}

// ─── Auth ──────────────────────────────────────────────────────────────────

export async function getMe(): Promise<UserDTO | null> {
  try {
    const r = await request<AuthResponse>("/auth/me");
    return r.user;
  } catch (e) {
    if (e instanceof ApiClientError && (e.status === 401 || e.code === "UNAUTHORIZED")) return null;
    throw e;
  }
}

export function signup(input: SignupInput): Promise<AuthResponse> {
  return request<AuthResponse>("/auth/signup", { method: "POST", body: JSON.stringify(input) });
}

export function login(input: LoginInput): Promise<AuthResponse> {
  return request<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify(input) });
}

export function logout(): Promise<void> {
  return request<void>("/auth/logout", { method: "POST" });
}

// ─── Usage ─────────────────────────────────────────────────────────────────

export function getUsage(): Promise<UsageDTO> {
  return request<UsageDTO>("/usage");
}

// ─── Conversions ───────────────────────────────────────────────────────────

/**
 * Upload a file and enqueue a conversion. Uses XMLHttpRequest so we can show
 * upload progress; fetch has no upload progress events yet.
 */
export function createConversion(
  file: File,
  target: string,
  onProgress?: (percent: number) => void,
): Promise<CreateConversionResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/conversions");
    xhr.setRequestHeader("Accept", "application/json");
    xhr.responseType = "text";

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.min(100, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onerror = () =>
      reject(new ApiClientError("NETWORK", "The upload was interrupted. Check your connection and try again.", 0));
    xhr.onabort = () => reject(new ApiClientError("NETWORK", "Upload cancelled.", 0));
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as CreateConversionResponse);
      else reject(toError(xhr.status, body));
    };

    // Text fields go first so the server can read them before the file stream.
    const fd = new FormData();
    fd.append("target", target);
    fd.append("file", file, file.name);
    xhr.send(fd);
  });
}

export function getConversion(id: string): Promise<ConversionDTO> {
  return request<ConversionDTO>(`/conversions/${encodeURIComponent(id)}`);
}

export async function listConversions(): Promise<ConversionDTO[]> {
  const r = await request<{ conversions: ConversionDTO[] }>("/conversions");
  return r.conversions;
}

export function deleteConversion(id: string): Promise<void> {
  return request<void>(`/conversions/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function downloadUrl(id: string): string {
  return `/api/conversions/${encodeURIComponent(id)}/download`;
}

// ─── Billing ───────────────────────────────────────────────────────────────

export function checkout(plan: PlanId, interval: BillingInterval): Promise<CheckoutResponse> {
  return request<CheckoutResponse>("/billing/checkout", { method: "POST", body: JSON.stringify({ plan, interval }) });
}

export function portal(): Promise<CheckoutResponse> {
  return request<CheckoutResponse>("/billing/portal", { method: "POST" });
}

// ─── Error copy ────────────────────────────────────────────────────────────

/** Plain-English explanation for an API error, for people not logs. */
export function explainError(e: unknown): string {
  if (!(e instanceof ApiClientError)) return "Something went wrong. Please try again.";
  switch (e.code) {
    case "QUOTA_EXCEEDED":
      return "You have used all of your free conversions.";
    case "FILE_TOO_LARGE":
      return e.message || "That file is larger than your plan allows.";
    case "UNSUPPORTED_FORMAT":
      return "We don't recognise that file type yet.";
    case "UNSUPPORTED_CONVERSION":
      return "That pair of formats can't be converted directly.";
    case "TOO_MANY_CONCURRENT":
      return "You already have a conversion running. Wait for it to finish, or upgrade to run several at once.";
    case "ENGINE_UNAVAILABLE":
      return "This conversion needs an engine that isn't installed on this server yet. Try another target format.";
    case "RATE_LIMITED":
      return "Too many uploads in a short time. Give it a minute and try again.";
    case "BILLING_UNAVAILABLE":
      return "Payments aren't switched on for this deployment yet.";
    case "UNAUTHORIZED":
      return "Please log in to continue.";
    case "CONFLICT":
      return "An account with that email already exists.";
    case "EXPIRED":
      return "This download has expired and the file has been deleted.";
    case "NOT_READY":
      return "The file isn't ready yet.";
    case "NETWORK":
      return e.message;
    default:
      return e.message || "Something went wrong. Please try again.";
  }
}
