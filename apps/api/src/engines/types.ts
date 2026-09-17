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

/** Generic memoised probe helper for binary-backed engines. */
export function memo<T>(fn: () => Promise<T>): () => Promise<T> {
  let cached: Promise<T> | undefined;
  return () => {
    if (!cached) {
      cached = fn().catch((err) => {
        cached = undefined;
        throw err;
      });
    }
    return cached;
  };
}
