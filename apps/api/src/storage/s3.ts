import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { assertSafeKey, type StorageDriver } from "./driver.js";
import { contentDisposition } from "../http.js";

export interface S3Options {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
}

/** Works with AWS S3, Cloudflare R2, MinIO and anything else S3-compatible. */
export class S3Storage implements StorageDriver {
  readonly kind = "s3" as const;
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(opts: S3Options) {
    this.bucket = opts.bucket;
    this.client = new S3Client({
      region: opts.region,
      endpoint: opts.endpoint,
      forcePathStyle: opts.forcePathStyle ?? Boolean(opts.endpoint),
      credentials:
        opts.accessKeyId && opts.secretAccessKey
          ? { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey }
          : undefined,
    });
  }

  async putFile(key: string, filePath: string, contentType?: string): Promise<void> {
    assertSafeKey(key);
    const { size } = await stat(filePath);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: createReadStream(filePath),
        ContentLength: size,
        ContentType: contentType ?? "application/octet-stream",
      }),
    );
  }

  async getStream(key: string): Promise<Readable> {
    assertSafeKey(key);
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const body = res.Body;
    if (!body) throw new Error(`empty body for ${key}`);
    if (body instanceof Readable) return body;
    // Web stream (should not happen in Node, but be safe)
    return Readable.fromWeb(body.transformToWebStream() as unknown as import("node:stream/web").ReadableStream);
  }

  async downloadToFile(key: string, destPath: string): Promise<void> {
    await mkdir(path.dirname(destPath), { recursive: true });
    const stream = await this.getStream(key);
    await pipeline(stream, createWriteStream(destPath));
  }

  async getSignedUrl(key: string, filename: string, contentType: string, ttlSeconds: number): Promise<string> {
    assertSafeKey(key);
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: contentDisposition(filename),
        ResponseContentType: contentType,
      }),
      { expiresIn: ttlSeconds },
    );
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (err) {
      if ((err as { name?: string }).name === "NoSuchKey") return;
      throw err;
    }
  }

  async stat(key: string): Promise<{ size: number } | null> {
    assertSafeKey(key);
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: Number(res.ContentLength ?? 0) };
    } catch (err) {
      const name = (err as { name?: string }).name;
      if (name === "NotFound" || name === "NoSuchKey") return null;
      throw err;
    }
  }
}
