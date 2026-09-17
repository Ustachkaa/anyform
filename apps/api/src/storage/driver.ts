import type { Readable } from "node:stream";

/**
 * Storage abstraction. Keys are always server-generated
 * (`src/2026/09/<id>.<ext>`, `out/2026/09/<id>.<ext>`); the user's original
 * filename lives in the database and is applied at download time.
 *
 * Uploads land on the API's local disk first (so the byte count is known and
 * the request can be rejected before touching object storage), then are handed
 * over as a file path.
 */
export interface StorageDriver {
  readonly kind: "local" | "s3";
  /** Store a local file under `key`. */
  putFile(key: string, filePath: string, contentType?: string): Promise<void>;
  /** Stream an object. Rejects with a NotFound-ish error if missing. */
  getStream(key: string): Promise<Readable>;
  /** Copy an object to a local path (used by the worker). */
  downloadToFile(key: string, destPath: string): Promise<void>;
  /** Presigned GET URL, when the driver supports it (S3). */
  getSignedUrl?(key: string, filename: string, contentType: string, ttlSeconds: number): Promise<string>;
  /** Delete an object; missing objects are not an error. */
  delete(key: string): Promise<void>;
  /** Size of an object, or null if missing. */
  stat(key: string): Promise<{ size: number } | null>;
}

const SAFE_KEY = /^(src|out)\/\d{4}\/\d{2}\/[A-Za-z0-9_-]+\.[a-z0-9]{1,8}$/;

/** Defensive check so a bug elsewhere can never turn a key into a path traversal. */
export function assertSafeKey(key: string): void {
  if (!SAFE_KEY.test(key)) throw new Error(`Refusing unsafe storage key: ${key}`);
}

export function buildKey(kind: "src" | "out", id: string, ext: string, at: Date = new Date()): string {
  const yyyy = String(at.getUTCFullYear());
  const mm = String(at.getUTCMonth() + 1).padStart(2, "0");
  const key = `${kind}/${yyyy}/${mm}/${id}.${ext}`;
  assertSafeKey(key);
  return key;
}
