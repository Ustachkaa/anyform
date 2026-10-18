import type { ConversionOptions, EngineInfo } from "@anyform/shared";

/** Everything an engine needs to perform one conversion. All paths are inside `tmpDir`. */
export interface EngineContext {
  inputPath: string;
  outputPath: string;
  fromExt: string;
  toExt: string;
  options: ConversionOptions;
  /** Private scratch directory for this job; deleted afterwards. */
  tmpDir: string;
  timeoutMs: number;
  /** 0–100. Engines that cannot report progress should call it with 100 at the end (the job does this anyway). */
  onProgress: (pct: number) => void;
  log: (msg: string) => void;
}

export interface Engine {
  /** Stored on the Conversion row and shown to the user, e.g. "ffmpeg". */
  readonly name: string;
  /** Cached availability check. */
  probe(): Promise<EngineInfo>;
  convert(ctx: EngineContext): Promise<void>;
}

export class EngineError extends Error {
  constructor(
    public readonly engine: string,
    message: string,
    public readonly stderr?: string,
  ) {
    super(message);
    this.name = "EngineError";
  }
}

/**
 * Memoised probe helper for binary-backed engines. An available engine is
 * cached for the life of the process; an unavailable one is re-probed after
 * `retryMs`, so a binary that was slow to start (LibreOffice cold start) or was
 * installed after boot is picked up without restarting the worker.
 */
export function memo(fn: () => Promise<EngineInfo>, retryMs = 60_000): () => Promise<EngineInfo> {
  let cached: Promise<EngineInfo> | undefined;
  let expiresAt = Infinity;
  return () => {
    if (!cached || Date.now() > expiresAt) {
      expiresAt = Infinity;
      cached = fn().then(
        (info) => {
          if (!info.available) expiresAt = Date.now() + retryMs;
          return info;
        },
        (err) => {
          cached = undefined;
          throw err;
        },
      );
    }
    return cached;
  };
}
