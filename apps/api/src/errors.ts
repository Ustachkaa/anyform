import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import type { ApiError, ApiErrorCode } from "@anyform/shared";

/** A typed HTTP error. Every non-2xx response the API produces goes through this shape. */
export class ApiHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiHttpError";
  }

  toBody(): ApiError {
    const body: ApiError = { error: { code: this.code, message: this.message } };
    if (this.details !== undefined) body.error.details = this.details;
    return body;
  }
}

export const errors = {
  validation: (message: string, details?: unknown) => new ApiHttpError(400, "VALIDATION", message, details),
  unauthorized: (message = "Sign in to continue.") => new ApiHttpError(401, "UNAUTHORIZED", message),
  forbidden: (message = "You do not have access to this resource.") => new ApiHttpError(403, "FORBIDDEN", message),
  notFound: (message = "Not found.") => new ApiHttpError(404, "NOT_FOUND", message),
  conflict: (message: string, details?: unknown) => new ApiHttpError(409, "CONFLICT", message, details),
  quotaExceeded: (details?: unknown) =>
    new ApiHttpError(402, "QUOTA_EXCEEDED", "You have used all of your free conversions. Upgrade to keep converting.", details),
  fileTooLarge: (maxBytes: number) =>
    new ApiHttpError(413, "FILE_TOO_LARGE", "That file is larger than your plan allows.", { maxBytes }),
  unsupportedFormat: (ext: string) =>
    new ApiHttpError(400, "UNSUPPORTED_FORMAT", `We do not recognise the format "${ext}".`, { ext }),
  unsupportedConversion: (from: string, to: string) =>
    new ApiHttpError(400, "UNSUPPORTED_CONVERSION", `Converting ${from} to ${to} is not supported.`, { from, to }),
  tooManyConcurrent: (limit: number) =>
    new ApiHttpError(429, "TOO_MANY_CONCURRENT", "You already have the maximum number of conversions running.", { limit }),
  engineUnavailable: (from: string, to: string) =>
    new ApiHttpError(503, "ENGINE_UNAVAILABLE", `No conversion engine is installed for ${from} → ${to}.`, { from, to }),
  notReady: () => new ApiHttpError(409, "NOT_READY", "This conversion has not finished yet."),
  expired: () => new ApiHttpError(410, "EXPIRED", "This file has expired and been deleted."),
  rateLimited: () => new ApiHttpError(429, "RATE_LIMITED", "Too many requests. Slow down a little."),
  billingUnavailable: () => new ApiHttpError(503, "BILLING_UNAVAILABLE", "Billing is not configured on this server."),
  internal: (message = "Something went wrong on our side.") => new ApiHttpError(500, "INTERNAL", message),
};

function zodDetails(err: ZodError) {
  return err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
}

type AnyError = FastifyError & { status?: number; details?: unknown };

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: AnyError, _req: FastifyRequest, reply: FastifyReply) => {
    if (err instanceof ApiHttpError) {
      return reply.status(err.status).send(err.toBody());
    }
    if (err instanceof ZodError) {
      return reply.status(400).send(errors.validation("Invalid request.", zodDetails(err)).toBody());
    }
    if (err.validation) {
      return reply.status(400).send(errors.validation(err.message).toBody());
    }
    const code = (err as { code?: string }).code;
    const status = err.statusCode ?? err.status;
    if (code === "FST_REQ_FILE_TOO_LARGE" || status === 413) {
      return reply.status(413).send({ error: { code: "FILE_TOO_LARGE", message: "That file is larger than your plan allows." } } satisfies ApiError);
    }
    if (code === "FST_INVALID_MULTIPART_CONTENT_TYPE" || code === "FST_FILES_LIMIT" || code === "FST_PARTS_LIMIT") {
      return reply.status(400).send(errors.validation(err.message).toBody());
    }
    if (status === 429) {
      return reply.status(429).send(errors.rateLimited().toBody());
    }
    if (status === 401 || (code && code.startsWith("FST_JWT"))) {
      return reply.status(401).send(errors.unauthorized().toBody());
    }
    if (status && status >= 400 && status < 500) {
      return reply.status(status).send(errors.validation(err.message).toBody());
    }
    _req.log.error({ err }, "unhandled error");
    return reply.status(500).send(errors.internal().toBody());
  });

  app.setNotFoundHandler((_req, reply) => {
    reply.status(404).send(errors.notFound("No such endpoint.").toBody());
  });
}
