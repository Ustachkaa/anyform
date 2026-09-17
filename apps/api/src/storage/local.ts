import { createReadStream } from "node:fs";
import { copyFile, mkdir, rename, rm, stat, unlink } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { assertSafeKey, type StorageDriver } from "./driver.js";

/**
 * Local-disk driver. The API and worker must share this directory (a Docker
 * volume in Compose, or the same machine in development).
 */
export class LocalStorage implements StorageDriver {
  readonly kind = "local" as const;
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private resolve(key: string): string {
    assertSafeKey(key);
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error("storage key escaped root");
    return full;
  }

  async putFile(key: string, filePath: string): Promise<void> {
    const dest = this.resolve(key);
    await mkdir(path.dirname(dest), { recursive: true });
    try {
      await rename(filePath, dest);
    } catch (err) {
      // rename fails across devices/volumes → fall back to copy + unlink
      if ((err as NodeJS.ErrnoException).code === "EXDEV") {
        await copyFile(filePath, dest);
        await unlink(filePath);
      } else {
        throw err;
      }
    }
  }

  async getStream(key: string): Promise<Readable> {
    const full = this.resolve(key);
    await stat(full); // throws ENOENT if missing
    return createReadStream(full);
  }

  async downloadToFile(key: string, destPath: string): Promise<void> {
    await mkdir(path.dirname(destPath), { recursive: true });
    await copyFile(this.resolve(key), destPath);
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }

  async stat(key: string): Promise<{ size: number } | null> {
    try {
      const s = await stat(this.resolve(key));
      return { size: s.size };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }
}
